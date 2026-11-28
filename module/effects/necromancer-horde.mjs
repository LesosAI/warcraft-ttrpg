/**
 * **THE NECROMANCER'S HORDE, ON THE BOARD** (02 §7's Command the Dead and its features; 07 §17's
 * *The Necromancer raises a horde*; the Necromancer plan's Phase 4 doors 3, 5 to 7, 9 to 11 and
 * 15). The law is `rules/horde.mjs`, `rules/raise.mjs`, `rules/grafts.mjs`, `rules/horde-stamps.mjs`
 * and `rules/necromancer-features.mjs`; this module is the doors.
 *
 * - **The raise** - `judgeHordeRaise` asks everything BEFORE anything is paid (D-768): the caster's
 *   token, a GM, the blocks, the corpses (through the knight's own corpse reader and chooser), the
 *   entry each creature rises as, the grafts and their Essence, Stitch Abomination's space, and the
 *   places - where a raise would pass them, the one chooser asks which raised dead collapse, and a
 *   dismissed chooser pays nothing. `hordeRaiseQueryHandler` makes it on the GM's client, judged
 *   again: ONE LINKED WORLD ACTOR AND ONE CARRIER A CREATURE, in the caster's own Actors folder
 *   (`bound.mjs#hordeFolder`), Loose Bones struck and the grafts stamped, Deathly Vigor's temporary
 *   Health, the first lead named where there is none.
 * - **The collapse** - a creature's carrier on the Necromancer is its clock: deleting it, for any
 *   reason, collapses that one creature (`bound.mjs#registerBoundHooks` -> `collapseRaise`), whose
 *   tokens go first carrying the collapse cue (`collapseHordeTokens`). `collapseHordeMember` is the
 *   door every collapse goes through: a dismissal, the places, Dark Ritual, a death, a Long Rest.
 * - **The shared turn's lead** - `nameLead` writes the `hordeLead` flag `horde.mjs#leadFor` reads;
 *   `hordeSurge` is Command the Dead's Empowered line.
 * - **The death watch's listeners** - Claim the Fallen's offer on a living death, Unending Dead's
 *   offer (or the collapse) on one of the raised dead dropping, Plague of Undeath's rising, and the
 *   lich's phylactery.
 * - **Enslave the Dead** - its control, laid on a failed Test and ended by its hour, never deleting
 *   the creature.
 */

import { AZEROTH } from "../config.mjs";
import {
  CORPSE_FLAG, HORDE_RISINGS, RAISE_FLAG, corpseRefusal, entryCompositions, hordeCount, hordeRaiseRow, raiseReach,
  raiseRoseAnyway, raiseSetRefusal, raiseSpanRounds, raiseUntil
} from "../rules/raise.mjs";
import {
  HORDE_LEAD_FLAG, collapseChoices, collapseEnough, hordeCapacity, hordeRefusal, leadFor, placesOf
} from "../rules/horde.mjs";
import { ABOMINATION, graftMenu, graftPlan, graftStamps } from "../rules/grafts.mjs";
import { hordeBlock } from "../rules/horde-stamps.mjs";
import {
  CLAIM_THE_FALLEN, DARK_RITUAL, HORDE_SURGE_FLAG, NECRO_FEATURES, PHYLACTERY, STOOD_AGAIN_FLAG, UNENDING_DEAD,
  claimFallenJudgement, countedMembers, darkRitualJudgement, darkRitualMana, deathlyVigor, enslaveGrant, enslaveRefusal,
  enslaveRestore, hordeMember, hordeTurnFacts, namedLead, phylacteryReturnJudgement, phylacteryWindowOpen, risingRefusal, risingReoffer, standAgainHealth,
  standAgainJudgement, stitchSpaceRefusal, unendingDeadJudgement
} from "../rules/necromancer-features.mjs";
import { SKELETAL_MASTERY } from "../rules/necromancer-lines.mjs";
import { adjustPool } from "../documents/pool-writes.mjs";
import { ESSENCE, isLiving } from "../rules/essence.mjs";
import { creatureSnapshot } from "../rules/creature-kinds.mjs";
import { skillRankOf } from "../rules/skills.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { risenRecord } from "../rules/animation-records.mjs";
import {
  COLLAPSE_OPTION, ENSLAVE_END_KEY, GRAFT_KEY, HORDE_RISE_KEY, LICH_BIND_KEY, MASTERY_KEY, RAISED_WITH_FLAG, collapseCue, raisedWithEntry
} from "../rules/necromancer-animations.mjs";
import { DISEASES } from "../rules/afflictions.mjs";
import { bondOf, boundOf, createBoundActor, hordeFolder, syncBoundFor, unbindQueryHandler, worldActorOf } from "../documents/bound.mjs";
import { summonQueryHandler } from "../documents/summon.mjs";
import {
  RAISE_QUERY, askGM, chooseCorpses, claimCorpses, collapseRaise, corpsesOn as corpsesFor, holdCarrier, knightToken, raiseQueryHandler, releaseCorpses
} from "./death-knight-necromancy.mjs";
import { roundsOrClock } from "./durations.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);

/** The operation key a carrier's deletion carries to say how its creature went (`bound.mjs`'s hook). */
export const HORDE_COLLAPSE_OPTION = "azerothHordeCollapse";
/** The query Enslave the Dead's control and its end are written through, on the active GM. */
export const ENSLAVE_QUERY = "azeroth-rpg.enslaveDead";
/** The query a Plague of Undeath rising, a phylactery's return and a horde collapse go through. */
export const HORDE_QUERY = "azeroth-rpg.horde";
/** The flag Enslave the Dead's control rides on the creature (`{casterUuid, casterName, entry, since, disposition}`). */
export const ENSLAVED_FLAG = "enslaved";
/** The flag a creature that failed Plague of Undeath's Test carries (`{casterUuid, until}`). */
export const PLAGUE_RISE_FLAG = "plagueRise";
/**
 * The Necromancer's queue of plague ghouls waiting for its next turn (`[{sceneId, tokenId, name}]`).
 * **Read and cleared, never written** since the 4b review's MUST-FIX 4: two deaths at once read and
 * wrote it over each other. A rising rides the corpse's own token now (`PLAGUE_RISING_TOKEN_FLAG`).
 */
export const PLAGUE_RISINGS_FLAG = "plagueRisings";
/**
 * **A PLAGUE RISING, ON THE CORPSE'S OWN TOKEN** (the 4b review's MUST-FIX 3 and 4): `{casterUuid,
 * diedAt, offered}`, written by the death (one write a corpse, so two deaths never race), gathered
 * at the caster's turn start, and the evidence the GM's raise handler reads before a ghoul stands.
 */
export const PLAGUE_RISING_TOKEN_FLAG = "plagueRising";

/* ------------------------------------------------------------------ */
/*  One at a time, on this client                                       */
/* ------------------------------------------------------------------ */

/** The tails of the chains `inOrder` keeps, by key. */
const CHAINS = new Map();

/**
 * **ONE TASK AT A TIME FOR A KEY, ON THIS CLIENT** (the 4b review's S7 and MUST-FIX 4): a raise and
 * an enslave for one Necromancer are judged and made one after another on the GM's client, so two
 * at once can never both pass the places, and the plague's turn-start gathering runs alone. Each
 * task starts once the last one queued has settled, thrown or not.
 *
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
export function inOrder(key, task) {
  const before = CHAINS.get(key) ?? Promise.resolve();
  const run = before.catch(() => null).then(() => task());
  const tail = run.catch(() => null);
  CHAINS.set(key, tail);
  tail.then(() => { if (CHAINS.get(key) === tail) CHAINS.delete(key); });
  return run;
}

/** The queue key for one Necromancer's horde writes. */
const hordeKey = owner => `horde:${owner?.uuid ?? owner ?? ""}`;
/** The offer card's template (Claim the Fallen, Unending Dead, a plague rising, a lich's return). */
const OFFER_TEMPLATE = "systems/azeroth-rpg/templates/chat/necro-offer.hbs";
/** The card kind every Necromancer offer posts under. */
export const NECRO_OFFER_KIND = "necroOffer";

/* ------------------------------------------------------------------ */
/*  Who is in the horde                                                 */
/* ------------------------------------------------------------------ */

/** The world actors standing in a Necromancer's horde: its `raised` bonds marked `horde`. */
export function hordeActorsOf(owner) {
  return boundOf(owner, "raised").filter(a => bondOf(a)?.horde === true);
}

/**
 * The creatures Enslave the Dead holds for this caster: the actor (world or token) carrying the
 * control's effect, its effect and its record. Read off every world actor and every unlinked
 * token, so a control on a creature the caster never bound is found.
 */
export function enslavedOf(owner) {
  if (!owner) return [];
  const out = [];
  const seen = new Set();
  const look = actor => {
    if (!actor || seen.has(actor.uuid)) return;
    for (const effect of actor.effects ?? []) {
      const record = effect.flags?.[SCOPE]?.[ENSLAVED_FLAG];
      if (record?.casterUuid === owner.uuid && effect.active !== false && !effect.disabled) {
        seen.add(actor.uuid);
        out.push({ actor, effect, record });
        return;
      }
    }
  };
  for (const a of game.actors ?? []) look(a);
  for (const scene of game.scenes ?? []) for (const token of scene.tokens ?? []) if (!token.actorLink) look(token.actor);
  return out.sort((a, b) => String(a.actor.uuid).localeCompare(String(b.actor.uuid)));
}

/** Every member of the horde as the law reads it: the raised dead, then what Enslave the Dead holds. */
export function membersOf(owner) {
  const raised = hordeActorsOf(owner)
    .map(a => hordeMember({ id: a.id, name: a.name, health: a.system?.health?.value ?? null, bond: bondOf(a) }))
    .filter(Boolean);
  const held = enslavedOf(owner).map(({ actor, record }) => ({
    id: actor.uuid, entry: String(record.entry ?? actor.name), raisedAt: Number(record.since) || 0,
    controlled: true, outside: false, keepsReaction: true, health: actor.system?.health?.value ?? null
  }));
  return [...raised, ...held];
}

/** The horde's places off the Necromancer as it stands (Intelligence, Swelling Ranks, The Endless Host, Arcana). */
export function capacityOf(owner) {
  const rankNamed = ranksOf(owner);
  return hordeCapacity({
    intMod: owner?.system?.abilities?.int?.mod ?? 0,
    swellingRanks: rankNamed("Swelling Ranks"), endlessHost: rankNamed("The Endless Host"),
    arcanaRanks: skillRankOf(owner, "arcana"),
    // The Darkmaster's Rod's A Larger Class (08 §20, D-2158): the held item's places, read off the
    // derived Signatures here and again on the GM's client, which calls this same reader.
    extra: owner?.system?.signatureEffects?.hordePlaces ?? 0
  });
}

/** The lead standing now, by world actor id, or null. */
export function leadOf(owner) {
  return leadFor({ flag: owner?.getFlag?.(SCOPE, HORDE_LEAD_FLAG) ?? null, members: countedLeadable(owner) });
}

/** The raised dead a lead may be: standing, not controlled (`leadFor` drops the controlled itself). */
function countedLeadable(owner) {
  return membersOf(owner).filter(m => !m.controlled && !(typeof m.health === "number" && m.health <= 0));
}

/** The Necromancer's Essence pool, or null. */
export function essenceOf(actor) {
  return (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === ESSENCE) ?? null;
}

/**
 * **TAKE ESSENCE OFF THE POOL, INSIDE ITS QUEUE** (the 4b review's last small item): read when the
 * write's turn comes and moved by the number, so a gain landing in between is never written over;
 * a pool that cannot cover it writes nothing. Whether it was paid.
 */
export async function spendEssence(actor, n) {
  const due = Math.max(0, Math.trunc(Number(n)) || 0);
  if (due <= 0) return true;
  if (!essenceOf(actor)) return false;
  return (await adjustPool(actor, { kind: "momentum", name: ESSENCE }, -due, { need: true })).ok;
}

/** **GIVE ESSENCE BACK** through the pool door's `refund` source, never past the cap. What came back. */
export async function refundEssence(actor, n) {
  const due = Math.max(0, Math.trunc(Number(n)) || 0);
  if (due <= 0 || !essenceOf(actor)) return 0;
  const done = await adjustPool(actor, { kind: "momentum", name: ESSENCE }, due, { options: { essenceGain: "refund" } });
  return Math.max(0, (done.after ?? 0) - (done.before ?? 0));
}

/** A token on the scene, as the cards record one. */
const refOf = token => (token ? { sceneId: token.parent?.id ?? null, tokenId: token.id } : null);

/** The world actor's token on a scene (the viewed one first), or null. */
function tokenOfActor(actor, scene = null) {
  const scenes = [scene, canvas?.scene, ...(game.scenes ?? [])].filter(Boolean);
  for (const s of scenes) {
    const token = s.tokens?.find?.(tk => tk.actorId === actor?.id || tk.actor === actor) ?? null;
    if (token) return token;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  The raise, judged before anything is paid                           */
/* ------------------------------------------------------------------ */

/** A corpse the next raise must take (Claim the Fallen's *on its corpse*), by caster uuid. */
const PENDING_CLAIM = new Map();
/** A test's own pick for Stitch Abomination's space (the Quench batch), else the board's pick. */
let STITCH_PICK = null;
/** Hand a pick for Stitch Abomination's space, for a live test; `null` puts the board's back. */
export function setStitchPick(fn) {
  STITCH_PICK = typeof fn === "function" ? fn : null;
}

/** The ranks the caster holds in a talent, by name (`AzerothActor#talentRanks`). */
const ranksOf = actor => name => Math.max(0, Math.trunc(Number(actor?.talentRanks?.(name))) || 0);

/**
 * **A HORDE RAISE, JUDGED BEFORE ANYTHING IS PAID** (D-768's order): every refusal in words and
 * null, or the plan the GM's handler makes.
 *
 * **WHAT THE CAST'S LINES BOUGHT** (`empower`; the 4b review's MUST-FIX 5 and 6): 04's Skeletal
 * Mastery's Empowered line (`mastery`: one more skeleton may rise as a Skeletal Mage), 02 §7's
 * Lasting (`lasting`: an hour-long span doubles; *until your next Long Rest* is no count) and
 * Far-reaching (`farReaching`: the corpses' reach and Stitch Abomination's space doubled). Each
 * rides the plan, and the GM's handler asks it again.
 *
 * @param {Actor} actor  the Necromancer
 * @param {Item} item    the spell
 * @param {{key: string, source?: object|null, empower?: {mastery?: boolean, lasting?: boolean, farReaching?: boolean}}} o
 * @returns {Promise<object|null>}
 */
export async function judgeHordeRaise(actor, item, { key, source = null, empower = {} } = {}) {
  const row = hordeRaiseRow(key, ranksOf(actor));
  if (!row) return null;
  const farReaching = empower?.farReaching === true;
  const lasting = empower?.lasting === true;
  // The line is drawn only on Raise Dead for a holder of Skeletal Mastery; ticked anywhere else it buys nothing.
  const mastery = empower?.mastery === true && key === SKELETAL_MASTERY.spell && ranksOf(actor)("Skeletal Mastery") > 0;
  const refuse = (k, data = {}) => {
    ui.notifications?.warn(t(`AZEROTH.Raise.Refuse.${k}`, { name: actor.name, spell: item.name, entry: row.entry, ...data }));
    return null;
  };
  const site = knightToken(actor, source);
  if (!site) return refuse("noToken");
  if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM");
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = pack ? await pack.getIndex() : null;
  // Every block a creature of this raise may rise as must be in the bestiary.
  const possible = [...new Set([row.entry, ...(row.choices ?? []), ...(row.entry === "Risen Skeleton" ? ["Skeletal Archer", "Skeletal Mage"] : [])])];
  for (const entry of possible.slice(0, row.choices ? possible.length : 1)) if (!index?.find(e => e.name === entry)) return refuse("noEntry", { entry });
  const { feetApart } = await import("../canvas/footprints.mjs");
  // **THE CORPSES** - none for Stitch Abomination, whose material is the GM's (the lead).
  let ids = [];
  if (row.corpses) {
    const reach = raiseReach(row, item.system?.range ?? "", { farReaching });
    const claim = PENDING_CLAIM.get(actor.uuid) ?? null;
    const all = corpsesFor(actor, row, { scene: site.scene, from: site.token, reach, feetApart });
    const rows = claim ? all.filter(r => r.id === claim) : all;
    if (!rows.some(r => !r.refusal)) return refuse(claim && rows[0]?.refusal ? rows[0].refusal : "noCorpse", { name: rows[0]?.name ?? "" });
    const open = rows.filter(r => !r.refusal);
    ids = claim && open.length === 1 ? [open[0].id] : await chooseCorpses(item, row, rows);
    if (!ids) return null;
    const tokenById = id => site.scene.tokens.get(id) ?? null;
    const set = raiseSetRefusal(ids, row, (a, b) => feetApart(tokenById(a), tokenById(b)));
    if (set) return refuse(set, { min: row.corpses.min, max: row.corpses.max, feet: row.together ?? 0 });
    const now = corpsesFor(actor, row, { scene: site.scene, from: site.token, reach, feetApart });
    const moved = ids.map(id => now.find(r => r.id === id)).find(r => !r || r.refusal);
    if (moved !== undefined) return refuse(moved?.refusal ?? "noCorpse", { name: moved?.name ?? "" });
  }
  const count = hordeCount(row, ids.length);
  // **WHAT EACH RISES AS** (The Dead Rise's choice; 04's Skeletal Archery and Skeletal Mastery).
  const comps = entryCompositions(row, { count, archery: ranksOf(actor)("Skeletal Archery"), mastery: ranksOf(actor)("Skeletal Mastery") + (mastery ? 1 : 0) });
  let comp = comps[0] ?? null;
  if (comps.length > 1) {
    const { chooseOption } = game.system.azeroth.workflows;
    const options = comps.map(c => ({
      key: c.key, available: true,
      name: Object.entries(c.counts).map(([entry, n]) => t("AZEROTH.Horde.EntryCount", { n, entry })).join(", "), description: ""
    }));
    const pick = await chooseOption(item, options, null, { prompt: t("AZEROTH.Horde.EntryPrompt", { spell: item.name, n: count }) });
    comp = pick ? comps.find(c => c.key === pick.key) ?? null : null;
    if (!comp) return null;
  }
  const entries = comp?.entries ?? [];
  for (const entry of new Set(entries)) if (!index?.find(e => e.name === entry)) return refuse("noEntry", { entry });
  // **THE GRAFTS** (07's Stitch Abomination; 04's Grafted Flesh, Surgeon's Hand, Practiced Stitcher,
  // Masterwork Abomination): one chooser a creature that may take any, judged whole with the
  // Essence held. Practiced Stitcher's discount is once a casting (the architect's Q4).
  const grafts = entries.map(() => []);
  let graftCost = 0;
  const menuFor = entry => graftMenu({
    entry, stitched: key === "stitch-abomination", surgeonsHand: ranksOf(actor)("Surgeon's Hand"),
    graftedFlesh: ranksOf(actor)("Grafted Flesh"), masterwork: key === "stitch-abomination" && ranksOf(actor)("Masterwork Abomination") > 0
  });
  const essence = essenceOf(actor);
  for (let i = 0; i < entries.length; i++) {
    const menu = menuFor(entries[i]);
    if (!menu.max || !essence) continue;
    const picks = await chooseGrafts(actor, item, entries[i], menu);
    if (picks === null) return null;
    grafts[i] = picks;
  }
  const flat = grafts.flat();
  if (flat.length) {
    const plans = grafts.map((p, i) => graftPlan({ menu: menuFor(entries[i]), picks: p, pool: { value: 999 }, practicedStitcher: 0 }));
    const bad = plans.find(p => !p.ok);
    if (bad) return refuseGraft(item, bad);
    graftCost = Math.max(0, flat.length - ranksOf(actor)("Practiced Stitcher"));
    if (graftCost > (essence?.value ?? 0)) return refuseGraft(item, { refusal: "short", n: graftCost });
  }
  // **STITCH ABOMINATION'S SPACE** (*rises under your control in an unoccupied space within range*).
  let at = null;
  if (!row.corpses) {
    at = await pickSpace(actor, site, raiseReach({}, item.system?.range ?? "", { farReaching }) ?? 30, item);
    if (!at) return null;
  }
  // **THE PLACES** (02 §7: *When a raise would take your horde past its places, choose which of
  // your raised dead collapse before you pay for the spell*).
  let collapse = [];
  if (!row.outside) {
    const members = countedMembers(membersOf(actor));
    const capacity = capacityOf(actor);
    const adding = entries.map(entry => ({ entry }));
    const judged = hordeRefusal({ members, adding, capacity });
    if (judged.refusal) return refuse("exceeds", { n: capacity.total });
    if (judged.collapse > 0) {
      collapse = await chooseCollapse(item, members, judged.collapse, { capacity, adding });
      if (!collapse) return null;
    }
  }
  return {
    key, horde: true, sceneId: site.scene.id, tokenId: site.token.id, corpses: [...ids].sort(), entries,
    grafts, graftCost, at, collapse, name: item.name,
    // What the cast's lines bought, asked again on the GM's client; the Essence Skeletal Mastery's
    // line costs, judged with the cast's other Essence in `castSpell`'s one pool check.
    lasting, farReaching, mastery, masteryEssence: mastery ? SKELETAL_MASTERY.essence : 0
  };
}

/** The graft chooser for one creature; `[]` for none, null where the chooser was dismissed. */
async function chooseGrafts(actor, item, entry, menu) {
  const { chooseOption } = game.system.azeroth.workflows;
  const options = [];
  for (const k of menu.options) {
    for (let n = 1; n <= menu.perGraft; n++) {
      options.push({ key: `${k}#${n}`, available: true, name: n > 1 ? t("AZEROTH.Graft.Again", { name: game.i18n.localize(`AZEROTH.Graft.${k}`) }) : game.i18n.localize(`AZEROTH.Graft.${k}`), description: `<p>${t(`AZEROTH.Graft.Does.${k}`)}</p>` });
    }
  }
  options.unshift({ key: "none", available: true, name: game.i18n.localize("AZEROTH.Graft.None"), description: "" });
  const picked = await chooseOption(item, options, null, { prompt: t("AZEROTH.Graft.Prompt", { entry, n: menu.max }), max: menu.max + 1 });
  if (!picked) return null;
  const keys = (Array.isArray(picked) ? picked : [picked]).map(o => o.key).filter(k => k !== "none").map(k => k.split("#")[0]);
  const out = [];
  for (const k of keys) {
    if (k !== "wardedHide") { out.push({ key: k, school: null }); continue; }
    const school = await chooseOption(item, Object.entries(AZEROTH.schools ?? {}).map(([s, label]) => ({ key: s, available: true, name: game.i18n.localize(label), description: "" })), null, { prompt: t("AZEROTH.Graft.SchoolPrompt", { entry }) });
    if (!school) return null;
    out.push({ key: k, school: school.key });
  }
  return out;
}

function refuseGraft(item, plan) {
  ui.notifications?.warn(t(`AZEROTH.Graft.Refuse.${plan.refusal ?? "unknown"}`, { spell: item.name, n: plan.n ?? 0, name: plan.key ? game.i18n.localize(`AZEROTH.Graft.${plan.key}`) : "" }));
  return null;
}

/** Stitch Abomination's space: a point picked within range of the caster, or null (said in words). */
async function pickSpace(actor, site, feet, item) {
  const { pixelsPerFoot } = await import("../canvas/regions.mjs");
  let point = null;
  if (STITCH_PICK) point = await STITCH_PICK({ actor, site, feet });
  else {
    const { pickPoint } = await import("../canvas/place.mjs");
    point = await pickPoint({ hint: t("AZEROTH.Horde.PickSpace", { spell: item.name, feet }), sceneId: site.scene.id });
  }
  if (!point) return null;
  const why = spaceJudged(site.scene, site.token, point, feet, pixelsPerFoot);
  if (why) {
    ui.notifications?.warn(t(`AZEROTH.Horde.Refuse.${why}`, { spell: item.name, feet }));
    return null;
  }
  return { x: point.x, y: point.y };
}

/**
 * **WHETHER A POINT IS A SPACE THE ABOMINATION MAY STAND IN** (S12): within `feet` of the caster's
 * own squares (D-732: the half-width of its footprint counts) and on no token's footprint. The one
 * reading for the pick and the GM's handler. A refusal's key, or null.
 */
function spaceJudged(scene, from, point, feet, pixelsPerFoot) {
  if (!scene || !from || !point) return "spaceRange";
  const perFoot = pixelsPerFoot(scene) || 1;
  const centre = from.getCenterPoint?.() ?? { x: from.x, y: from.y };
  const apart = Math.hypot(point.x - centre.x, point.y - centre.y) / perFoot;
  const half = ((from.width ?? 1) * (scene.grid?.distance ?? 5)) / 2;
  const size = scene.grid?.size ?? 100;
  const occupied = (scene.tokens ?? []).some(tk => point.x >= tk.x && point.x < tk.x + (tk.width ?? 1) * size && point.y >= tk.y && point.y < tk.y + (tk.height ?? 1) * size);
  return stitchSpaceRefusal({ apart, half, feet, occupied });
}

/**
 * The collapse chooser (02 §7), the raised dead in a fixed order; null where dismissed or where
 * the pick does not make room (said in words).
 */
async function chooseCollapse(item, members, need, { capacity, adding }) {
  const { chooseOption } = game.system.azeroth.workflows;
  const ordered = collapseChoices(members);
  const options = ordered.map(m => ({
    key: m.id, available: true, checked: false,
    name: t("AZEROTH.Horde.CollapseOption", { name: nameOfMember(m), places: placesOf(m) }), description: ""
  }));
  const picked = await chooseOption(item, options, null, { prompt: t("AZEROTH.Horde.CollapsePrompt", { spell: item.name, n: need }), max: Math.max(2, ordered.length) });
  if (!picked) return null;
  const remove = (Array.isArray(picked) ? picked : [picked]).map(o => o.key);
  if (!collapseEnough({ members, remove, adding, capacity })) {
    ui.notifications?.warn(t("AZEROTH.Horde.Refuse.notEnough", { spell: item.name, n: need }));
    return null;
  }
  return remove;
}

function nameOfMember(m) {
  if (m.controlled) {
    try { return fromUuidSync(m.id)?.name ?? m.entry; } catch { return m.entry; }
  }
  return game.actors?.get(m.id)?.name ?? m.entry;
}

/* ------------------------------------------------------------------ */
/*  The raise, made on the GM's client                                  */
/* ------------------------------------------------------------------ */

/**
 * **THE GM-SIDE HORDE RAISE** (through `RAISE_QUERY`, the knight's query, which hands a horde row
 * here): the asker owns the Necromancer; everything is judged again off the world as it stands;
 * the corpses are claimed with no await between the read and the claim; the raised dead the
 * caster chose collapse; then one linked actor, one token and one carrier a creature. Throws with
 * the reason.
 *
 * **ONE RAISE AT A TIME FOR ONE NECROMANCER** (the 4b review's S7): judged and made inside that
 * caster's own chain on this client (`inOrder`), so two raises at once cannot both pass the places.
 * **A PLAGUE RISING NAMES ITS CORPSE** (MUST-FIX 3): the corpse token's own rising mark for this
 * caster is the evidence, claimed with no await between the read and the claim and used up there.
 */
export function hordeRaiseQueryHandler(payload = {}, options = {}) {
  return inOrder(hordeKey(payload?.ownerUuid ?? null), () => makeHordeRaise(payload ?? {}, options ?? {}));
}

async function makeHordeRaise(payload = {}, { user = null } = {}) {
  const {
    ownerUuid = null, key = null, sceneId = null, tokenId = null, corpses = [], name = "", entries = [], grafts = [], at = null, collapse = [],
    rising = false, corpseSceneId = null, lasting = false, farReaching = false, mastery = false, sacrifice = null
  } = payload;
  const owner = ownerUuid ? await fromUuid(ownerUuid) : null;
  if (owner?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Bound.NoOwner"));
  if (user && !owner.testUserPermission(user, "OWNER")) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  // **04's ACOLYTE'S SACRIFICE** (Phase 4c-T: *choose one of your raised dead within 30 feet of you. It
  // collapses. A Shade rises in its space as one of your raised dead, until your next Long Rest.
  // Empowered ... The Shade takes no place in your horde*): a rising no cast chooses, its row
  // `HORDE_RISINGS`', judged again here off the talent held and the creature offered.
  const offering = sacrifice && typeof sacrifice === "object" && key === "acolytes-sacrifice" ? sacrifice : null;
  const risingRow = rising || offering;
  const row = risingRow ? HORDE_RISINGS[key] ?? null : hordeRaiseRow(key, ranksOf(owner));
  const scene = sceneId ? game.scenes.get(sceneId) : null;
  const from = scene?.tokens?.get(tokenId) ?? null;
  if (!row || !scene || !from) throw new Error(t("AZEROTH.Raise.Refuse.noToken", { name: owner.name }));
  if (from.actorId !== owner.id) throw new Error(t("AZEROTH.Raise.Refuse.notKnight", { name: owner.name }));
  const spell = offering
    ? owner.items.find(i => i.type === "talent" && i.system?.identifier === key && (i.system?.taken ?? 0) > 0) ?? null
    : owner.items.find(i => i.type === "spell" && i.system?.identifier === key) ?? null;
  if (!spell) throw new Error(t("AZEROTH.Raise.Refuse.notHeld", { name: owner.name, spell: name || key }));
  // The offering: one of this caster's raised dead, standing, within 30 feet of the caster's squares.
  let offeringAt = null;
  if (offering) {
    const victim = game.actors.get(String(offering.actorId ?? "")) ?? null;
    const body = victim ? scene.tokens.find(tk => tk.actorId === victim.id) ?? null : null;
    const { feetApart: apart } = await import("../canvas/footprints.mjs");
    const feet = body ? apart(from, body) : null;
    if (!victim || bondOf(victim)?.ownerUuid !== owner.uuid || bondOf(victim)?.horde !== true || (victim.system?.health?.value ?? 0) <= 0
      || !(typeof feet === "number" && feet <= 30 + 1e-6)) {
      throw new Error(t("AZEROTH.NecroTalent.Refuse.noServantNear", { name: owner.name, feature: name || key, feet: 30 }));
    }
    offeringAt = body.getCenterPoint?.() ?? { x: body.x, y: body.y };
  }
  const list = (Array.isArray(entries) ? entries : []).map(String);
  // The blocks, read once.
  const pack = game.packs.get("azeroth-rpg.bestiary");
  const index = (await pack?.getIndex()) ?? [];
  const docs = {};
  for (const entry of new Set(list)) {
    const found = index.find(e => e.name === entry) ?? null;
    docs[entry] = found ? await pack.getDocument(found._id) : null;
    if (!docs[entry]) throw new Error(t("AZEROTH.Raise.Refuse.noEntry", { entry }));
  }
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { pixelsPerFoot } = await import("../canvas/regions.mjs");
  // The corpses, judged again here, with no await from the read to the claim.
  const ids = [...new Set((corpses ?? []).filter(id => typeof id === "string"))];
  let claimed = [];
  // The scene the corpses lie on: the caster's, or - for a plague rising - the corpse's own.
  let corpseScene = scene;
  // Where a plague ghoul stands: the corpse's centre, read here, never the payload's.
  let risingAt = null;
  if (rising) {
    // **A PLAGUE RISING, JUDGED AGAIN AND CLAIMED** (MUST-FIX 3): the corpse token's rising mark for
    // THIS caster, the corpse not raised, destroyed, sealed or kept by another - then claimed at once.
    corpseScene = game.scenes.get(corpseSceneId ?? sceneId) ?? null;
    const body = ids.length === 1 ? corpseScene?.tokens?.get(ids[0]) ?? null : null;
    const live = body ? corpseRefusal({ mark: body.getFlag?.(SCOPE, CORPSE_FLAG) ?? null }, {}, { knightUuid: owner.uuid, now: game.time?.worldTime ?? 0 }) : null;
    const why = body ? risingRefusal({ mark: body.getFlag?.(SCOPE, PLAGUE_RISING_TOKEN_FLAG) ?? null, casterUuid: owner.uuid, corpse: live ? { state: live } : null }) : "risingGone";
    if (why) throw new Error(t(why === "risingGone" ? "AZEROTH.Horde.Refuse.risingGone" : `AZEROTH.Raise.Refuse.${why}`, { name: body?.name ?? owner.name, spell: name, entry: row.entry }));
    const taken = claimCorpses(ids);
    if (taken) throw new Error(t("AZEROTH.Raise.Refuse.raised", { name: body.name ?? "", spell: name, entry: row.entry }));
    claimed = ids;
    risingAt = body.getCenterPoint?.() ?? { x: body.x, y: body.y };
  } else if (row.corpses) {
    const reach = raiseReach(row, spell.system?.range ?? "", { farReaching: farReaching === true });
    const rows = corpsesFor(owner, row, { scene, from, reach, viewer: user ?? game.user, feetApart });
    const bad = ids.map(id => rows.find(r => r.id === id)).find(r => !r || r.refusal);
    if (bad !== undefined) throw new Error(t(`AZEROTH.Raise.Refuse.${bad?.refusal ?? "noCorpse"}`, { name: bad?.name ?? "", spell: name, entry: row.entry }));
    const set = raiseSetRefusal(ids, row, (a, b) => feetApart(scene.tokens.get(a), scene.tokens.get(b)));
    if (set) throw new Error(t(`AZEROTH.Raise.Refuse.${set}`, { spell: name, entry: row.entry, min: row.corpses.min, max: row.corpses.max, feet: row.together ?? 0 }));
    const taken = claimCorpses(ids);
    if (taken) throw new Error(t("AZEROTH.Raise.Refuse.raised", { name: scene.tokens.get(taken)?.name ?? "", spell: name, entry: row.entry }));
    claimed = ids;
  }
  // What this raise wrote, so a failure part way can be undone: the dead made and their carriers.
  const made = [];
  try {
    // The creatures as the caster's talents allow them, asked again - Skeletal Mastery's Empowered
    // line (MUST-FIX 5) only on Raise Dead and only for a holder of the talent.
    const masteryPlus = !rising && mastery === true && key === SKELETAL_MASTERY.spell && ranksOf(owner)("Skeletal Mastery") > 0 ? 1 : 0;
    const count = risingRow ? 1 : hordeCount(row, ids.length);
    if (list.length !== count) throw new Error(t("AZEROTH.Horde.Refuse.entries", { spell: name }));
    const comps = risingRow ? [{ entries: [row.entry] }] : entryCompositions(row, { count, archery: ranksOf(owner)("Skeletal Archery"), mastery: ranksOf(owner)("Skeletal Mastery") + masteryPlus });
    if (!comps.some(c => JSON.stringify(c.entries) === JSON.stringify(list))) throw new Error(t("AZEROTH.Horde.Refuse.entries", { spell: name }));
    // **STITCH ABOMINATION'S SPACE, ASKED AGAIN** (S12): within the reach of the caster's squares and
    // unoccupied, off the board as it stands here.
    if (!row.corpses && !risingRow) {
      const feet = raiseReach({}, spell.system?.range ?? "", { farReaching: farReaching === true }) ?? 30;
      const point = at && Number.isFinite(Number(at.x)) && Number.isFinite(Number(at.y)) ? { x: Number(at.x), y: Number(at.y) } : null;
      const why = spaceJudged(scene, from, point, feet, pixelsPerFoot);
      if (why) throw new Error(t(`AZEROTH.Horde.Refuse.${why}`, { spell: name, feet }));
    }
    // The grafts asked again: on the menu, none too often, a school for a Warded Hide.
    const masterwork = key === "stitch-abomination" && ranksOf(owner)("Masterwork Abomination") > 0;
    const picksBy = list.map((entry, i) => {
      const p = Array.isArray(grafts?.[i]) ? grafts[i] : [];
      if (!p.length) return [];
      const menu = graftMenu({ entry, stitched: key === "stitch-abomination", surgeonsHand: ranksOf(owner)("Surgeon's Hand"), graftedFlesh: ranksOf(owner)("Grafted Flesh"), masterwork });
      const judged = graftPlan({ menu, picks: p, pool: { value: 999 } });
      if (!judged.ok) throw new Error(t(`AZEROTH.Graft.Refuse.${judged.refusal}`, { spell: name, n: 0, name: judged.key ?? "" }));
      return judged.picks;
    });
    // **THE PLACES, ASKED AGAIN** (D-976's re-ask): the horde as it stands on this client. A chosen
    // creature already gone - collapsed, dead, released - is dropped before the judgement (S6), so
    // the raise is refused only where what is left no longer makes room.
    const standingIds = new Set(countedMembers(membersOf(owner)).map(m => String(m.id)));
    const removing = (Array.isArray(collapse) ? collapse : []).map(String).filter(id => standingIds.has(id));
    // An empowered Shade takes no place (*The Shade takes no place in your horde*).
    const outsideNow = offering ? offering.empowered === true : row.outside === true;
    if (!outsideNow) {
      const members = countedMembers(membersOf(owner));
      const capacity = capacityOf(owner);
      const adding = list.map(entry => ({ entry }));
      if (!collapseEnough({ members, remove: removing, adding, capacity })) throw new Error(t("AZEROTH.Horde.Refuse.places", { spell: name, n: capacity.total }));
    }
    if (claimed.length) {
      await corpseScene.updateEmbeddedDocuments("Token", claimed.map(id => ({
        _id: id, [`flags.${SCOPE}.${CORPSE_FLAG}`]: { state: "raised", by: owner.uuid, until: null },
        // A plague rising is used up with its corpse.
        ...(rising ? { [`flags.${SCOPE}.${PLAGUE_RISING_TOKEN_FLAG}`]: foundry.data.operators.ForcedDeletion.create() } : {})
      })));
    }
    // **THE CHOSEN COLLAPSE BEFORE THE NEW DEAD STAND** (02 §7), each by the caster's choice.
    for (const id of removing) {
      const member = game.actors.get(id) ?? (() => { try { return fromUuidSync(id); } catch { return null; } })();
      if (!member) continue;
      if (bondOf(worldActorOf(member))?.horde === true) await collapseNow(owner, worldActorOf(member), { byChoice: true, reason: offering && member.id === offering.actorId ? "acolytesSacrifice" : "capacity", by: refOf(from) });
      else await endEnslaved(member, { reason: "capacity" });
    }
    const folder = await hordeFolder(owner);
    // Deathly Vigor is *When one of your spells raises a creature*: a talent's Shade takes none.
    const fromSpell = !offering;
    const vigor = owner.hasFeature?.(NECRO_FEATURES.deathlyVigor) === true && fromSpell ? deathlyVigor(owner.system?.abilities?.int?.mod ?? 0) : 0;
    const leadBefore = leadOf(owner);
    const spellDC = Math.trunc(Number(owner.system?.spellDC)) || 10;
    const tier = owner.system?.tier ?? 1;
    const placedIds = [], grafted = [], vigorous = [], mastered = [];
    // The mages past the rank: the one Skeletal Mastery's Empowered line stood up (its cue's tokens).
    const baseMages = ranksOf(owner)("Skeletal Mastery");
    let mages = 0;
    const placeOn = rising ? corpseScene : scene;
    // 02 §7's Lasting (MUST-FIX 6): an hour-long span doubles; a Long Rest's is no count.
    const rounds = raiseSpanRounds(row, { lasting: !risingRow && lasting === true });
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      const stamps = graftStamps(picksBy[i], { tier });
      const raiseId = foundry.utils.randomID();
      const actor = await createBoundActor({
        owner, entry: docs[entry], kind: "raised", until: raiseUntil(row), count: 1, linkedAs: true, folderId: folder?.id ?? null,
        sourceName: name || row.entry, raise: key, raiseId,
        bondExtra: {
          horde: true, keepsReaction: row.keepsReaction === true, outside: outsideNow, grafts: stamps.map(s => s.graft), places: placesOf({ entry }),
          // The fight and round it rose in, for 04's Unsummon (*You regain none for a creature raised this round*).
          raisedCombat: owner.activeFight?.()?.started ? owner.activeFight().id : null, raisedRound: owner.activeFight?.()?.started ? owner.activeFight().round : null
        },
        transform: data => hordeBlock(data, {
          stamps, masterwork: masterwork && entry === ABOMINATION, spellDC,
          words: (k, d = {}) => game.i18n.format(k, d)
        })
      });
      made.push(actor);
      const corpse = claimed.length ? corpseScene.tokens.get(claimed[Math.min(claimed.length - 1, Math.floor(i / Math.max(1, row.perCorpse ?? 1)))]) : null;
      const point = rising ? risingAt : offering ? offeringAt : (at ?? (corpse ? (corpse.getCenterPoint?.() ?? { x: corpse.x, y: corpse.y }) : null));
      const placed = await summonQueryHandler({ summonerUuid: owner.uuid, actorUuid: actor.uuid, count: 1, at: point, sceneId: placeOn.id }, { user: game.user });
      const tokenIds = placed?.tokenIds ?? [];
      placedIds.push(...tokenIds);
      if (stamps.length) grafted.push(...tokenIds);
      if (entry === "Skeletal Mage" && masteryPlus && (mages++) >= baseMages) mastered.push(...tokenIds);
      await owner.createEmbeddedDocuments("ActiveEffect", [{
        name: t("AZEROTH.Horde.Carrier", { name: actor.name, spell: name || row.entry }),
        img: actor.img || "icons/svg/skull.svg", origin: owner.uuid,
        description: `<p>${t(rounds ? "AZEROTH.Horde.CarrierText" : "AZEROTH.Horde.CarrierLongRest", { name: actor.name, rounds: rounds ?? 0 })}</p>`,
        // Twelve skeletons are twelve carriers: none draws on the Necromancer's token, and the horde
        // panel lists every one (the plan's door 14).
        showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,
        ...(rounds ? (roundsOrClock(owner, rounds) ?? {}) : {}),
        flags: { [SCOPE]: { [RAISE_FLAG]: { raise: key, raiseId, entry, count: 1, actorUuid: actor.uuid, horde: true } } }
      }]);
      if (vigor > 0) {
        const done = await actor.grantTemporaryHealth?.(vigor, { source: NECRO_FEATURES.deathlyVigor, span: "longRest" });
        if (done?.landed) vigorous.push(...tokenIds);
      }
    }
    // **THE NEW DEAD TAKE THE CASTER'S TALENTS AND SIGNATURES** (the phase 2 review: the
    // Vestments of the Cult of the Damned never reached a horde raise): the Death Knight's
    // single raise syncs here too (`death-knight-necromancy.mjs`). Its own step, said and never
    // undone, so a throw from the sync cannot unmake dead that already stand.
    if (made.length) {
      try {
        await syncBoundFor(owner);
      } catch (err) {
        console.warn("azeroth-rpg | horde raise: bond sync", err);
      }
    }
    // *When you have no lead, the next creature you raise is your lead* (02 §7).
    // 04's Watchful Shades: a Shade rises seeing the invisible.
    if (offering && placedIds.length) {
      try {
        const { syncWatchfulShades } = await import("./necromancer-talents.mjs");
        await syncWatchfulShades(owner);
      } catch (err) {
        console.warn("azeroth-rpg | Watchful Shades", err);
      }
    }
    if (!leadBefore && made.length && !outsideNow) {
      await owner.setFlag(SCOPE, HORDE_LEAD_FLAG, { id: made[0].id, previous: null, taken: true });
    }
    return { count: made.length, name: made[0]?.name ?? row.entry, names: made.map(a => a.name), uuids: made.map(a => a.uuid), tokenIds: placedIds, sceneId: placeOn.id, grafted, vigor: vigorous, mastered };
  } catch (err) {
    // **UNDO WHAT ROSE** where a later write failed: the dead made, their tokens and their carriers,
    // and the corpses' marks put back (a corpse claimed here was open before the claim). A raised
    // dead the caster chose to collapse stays collapsed: that was paid for by the choice.
    for (const actor of made) {
      try {
        const raiseId = bondOf(actor)?.raiseId ?? null;
        if (game.actors.has(actor.id)) await unbindQueryHandler({ uuid: actor.uuid }, { user: game.user });
        const carriers = [...owner.effects].filter(e => raiseId && e.flags?.[SCOPE]?.[RAISE_FLAG]?.raiseId === raiseId).map(e => e.id);
        if (carriers.length) await owner.deleteEmbeddedDocuments("ActiveEffect", carriers, { [HORDE_COLLAPSE_OPTION]: { byChoice: false, reason: "undo" } });
      } catch (e) {
        console.warn("azeroth-rpg | horde raise undo", e);
      }
    }
    if (claimed.length) {
      try {
        // The corpse's mark put back; a plague rising's mark goes back NOT OFFERED (the fix runs'
        // review, MUST-FIX 2): the card's one press is spent and its button struck, so the caster's
        // next turn start posts a fresh card (`risingsFor` skips a mark already offered).
        await corpseScene.updateEmbeddedDocuments("Token", claimed.filter(id => corpseScene.tokens.has(id)).map(id => ({
          _id: id, flags: { [SCOPE]: { [CORPSE_FLAG]: foundry.data.operators.ForcedDeletion.create(), ...(rising ? { [PLAGUE_RISING_TOKEN_FLAG]: { casterUuid: owner.uuid, diedAt: game.time?.worldTime ?? 0, offered: false } } : {}) } }
        })));
      } catch (e) {
        console.warn("azeroth-rpg | horde raise undo", e);
      }
    }
    throw new Error(t("AZEROTH.Horde.Refuse.failed", { spell: name || row.entry, reason: err?.message ?? "" }));
  } finally {
    releaseCorpses(claimed);
  }
}

/**
 * **THE HORDE RISES** once the cast is paid for and its Test has succeeded: through the GM's client.
 * The card's lines; `onRisen` takes the tokens placed and what touched them (`raisedWith`).
 */
export async function raiseHorde(actor, plan, { onRisen = null, onRefused = null } = {}) {
  const carriersNow = () => [...(actor?.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[RAISE_FLAG]?.raise === plan.key).map(e => e.id);
  const before = carriersNow();
  try {
    const done = await askGM(RAISE_QUERY, raiseQueryHandler, { ownerUuid: actor.uuid, ...plan });
    if (typeof onRisen === "function" && done?.tokenIds?.length) {
      try { onRisen({ tokenIds: done.tokenIds, sceneId: done.sceneId ?? null, grafted: done.grafted ?? [], vigor: done.vigor ?? [], mastered: done.mastered ?? [] }); } catch (err) { console.warn("azeroth-rpg | horde: risen record", err); }
    }
    const lines = [t(done?.count ? "AZEROTH.Horde.Raised" : "AZEROTH.Raise.RaisedNoToken", { name: actor.name, names: (done?.names ?? []).join(", "), n: done?.count ?? 0, spell: plan.name, entry: done?.name ?? "" })];
    if (plan.graftCost > 0) lines.push(t("AZEROTH.Graft.Paid", { n: plan.graftCost }));
    if (plan.mastery === true) lines.push(t("AZEROTH.Necromancer.SkeletalMastery.Paid", { n: plan.masteryEssence ?? SKELETAL_MASTERY.essence, mages: done?.mastered?.length ?? 0 }));
    if (done?.vigor?.length) lines.push(t("AZEROTH.Horde.Vigor", { n: deathlyVigor(actor.system?.abilities?.int?.mod ?? 0) }));
    return lines;
  } catch (err) {
    ui.notifications?.warn(err.message);
    if (!raiseRoseAnyway(before, carriersNow())) {
      if (typeof onRefused === "function") {
        try { await onRefused(err); } catch (e) { console.warn("azeroth-rpg | horde: refund", e); }
      }
      // **EVERY ESSENCE THE CAST SPENT, GIVEN BACK** (the 4b review's S10): the grafts', the empower
      // lines', Skeletal Mastery's and Claim the Fallen's - `essencePaid`, what the payment block
      // actually took - through the pool door's `refund` source, said on the card.
      const owed = Math.max(0, Math.trunc(Number(plan.essencePaid ?? plan.graftCost)) || 0);
      const back = await refundEssence(actor, owed);
      if (back > 0) return [err.message, t("AZEROTH.Horde.EssenceRefunded", { name: actor.name, n: back })];
    }
    return [err.message];
  }
}

/** The card's `raisedWith` for what a raise touched (the animation contract's §1). */
export function raisedWithOf(placed) {
  if (!placed?.sceneId) return [];
  return [
    raisedWithEntry({ key: GRAFT_KEY, placed: { sceneId: placed.sceneId, tokenIds: placed.grafted ?? [] } }),
    raisedWithEntry({ key: "deathly-vigor", placed: { sceneId: placed.sceneId, tokenIds: placed.vigor ?? [] } }),
    raisedWithEntry({ key: MASTERY_KEY, placed: { sceneId: placed.sceneId, tokenIds: placed.mastered ?? [] } })
  ].filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  The collapse                                                        */
/* ------------------------------------------------------------------ */

/** The carriers on the Necromancer that hold one horde creature. */
function carriersOf(owner, actor) {
  const bond = bondOf(actor);
  return [...(owner?.effects ?? [])].filter(e => {
    const r = e.flags?.[SCOPE]?.[RAISE_FLAG];
    return r?.horde === true && (r.raiseId === bond?.raiseId || r.actorUuid === actor?.uuid);
  });
}

/**
 * **ONE HORDE CREATURE COLLAPSES** - the door every collapse goes through: its carrier deleted
 * with how it went on the operation, which collapses it on the active GM (`registerBoundHooks`);
 * where no carrier stands, collapsed directly on the GM's client.
 *
 * @param {Actor} owner
 * @param {Actor} actor  the creature's world actor
 * @param {{byChoice?: boolean, reason?: string, by?: object|null}} how
 */
export async function collapseHordeMember(owner, actor, { byChoice = false, reason = "dismiss", by = null } = {}) {
  actor = worldActorOf(actor);
  if (!owner || !actor) return false;
  const how = { byChoice: byChoice === true, reason, by: by ?? refOf(tokenOfActor(owner)) };
  if (game.user?.isGM) return collapseNow(owner, actor, how);
  const carriers = carriersOf(owner, actor);
  if (carriers.length && owner.isOwner) {
    await owner.deleteEmbeddedDocuments("ActiveEffect", carriers.map(e => e.id), { [HORDE_COLLAPSE_OPTION]: how });
    return true;
  }
  try {
    await askGM(HORDE_QUERY, hordeQueryHandler, { act: "collapse", ownerUuid: owner.uuid, actorUuid: actor.uuid, how });
    return true;
  } catch (err) {
    ui.notifications?.warn(err.message);
    return false;
  }
}

/** The collapses in flight on this client, by raise id (or the actor's uuid): one each (S8). */
const COLLAPSES = new Map();

/**
 * The GM's collapse, awaited whole: the creature and its tokens first, then its carrier.
 *
 * **ONE COLLAPSE OF ONE CREATURE AT A TIME** (the 4b review's S8): a second caller - a dismissal
 * beside a turn-start collapse, two hooks at once - is handed the promise already in flight, so the
 * carrier is never deleted twice (core: *ActiveEffect ... does not exist*).
 */
function collapseNow(owner, actor, how) {
  const key = bondOf(actor)?.raiseId ?? actor?.uuid ?? null;
  if (key && COLLAPSES.has(key)) return COLLAPSES.get(key);
  const run = collapseOnce(owner, actor, how).finally(() => { if (key && COLLAPSES.get(key) === run) COLLAPSES.delete(key); });
  if (key) COLLAPSES.set(key, run);
  return run;
}

async function collapseOnce(owner, actor, how) {
  const bond = bondOf(actor);
  const carriers = carriersOf(owner, actor).map(e => e.id);
  // The carrier is this door's to delete: held from `dropEmptyCarrier` until it has (one delete).
  const release = holdCarrier(bond?.raiseId ?? null);
  try {
    if (bond?.raiseId) await collapseRaise(bond.raiseId, { ...how, ownerUuid: owner.uuid });
    else await unbindQueryHandler({ uuid: actor.uuid }, { user: game.user });
    const left = carriers.filter(id => owner.effects.has(id));
    if (left.length) await owner.deleteEmbeddedDocuments("ActiveEffect", left, { [HORDE_COLLAPSE_OPTION]: how });
  } finally {
    release();
  }
  return true;
}

/**
 * **THE RAISED DEAD WHOSE COLLAPSE IS UNDER WAY ON THIS CLIENT** (fix run 4-T), by world actor id:
 * marked as its tokens start to go and forgotten a minute later. A fight's `_onExit` for its
 * combatant runs unawaited after the token goes (core, on the active GM), and a write on the actor
 * there lands after the collapse has deleted it: the server refuses an update of an actor it no
 * longer holds (*Cannot read properties of undefined (reading '_id')*). `AzerothCombat#_leaveFight`
 * asks `collapsingNow` and leaves such a creature alone.
 */
const COLLAPSING = new Set();
const COLLAPSING_MS = 60000;
function markCollapsing(actor) {
  const id = actor?.id ?? null;
  if (!id) return;
  COLLAPSING.add(id);
  setTimeout(() => COLLAPSING.delete(id), COLLAPSING_MS);
}

/**
 * **A COLLAPSE THAT LEFT ITS CREATURE STANDING FORGETS ITS MARK** (the fix run 4 review): where the
 * unbind refused (`unbindQueryHandler` throws for a user who owns neither side) or a write failed, the
 * world actor is still in `game.actors`, and a mark left for its minute would keep
 * `AzerothCombat#_leaveFight` from cleaning a creature that is still there. Asked by `collapseRaise`
 * in a `finally` after every unbind. True where the mark was cleared.
 */
export function forgetCollapsingIfStanding(actor) {
  const id = actor?.id ?? null;
  if (!id || !COLLAPSING.has(id) || game.actors?.has?.(id) !== true) return false;
  COLLAPSING.delete(id);
  return true;
}

/** Whether this creature's world actor is being collapsed on this client, or is gone already. */
export function collapsingNow(actor) {
  if (!actor) return false;
  if (COLLAPSING.has(actor.id)) return true;
  return !actor.isToken && bondOf(actor)?.kind === "raised" && !game.actors?.has?.(actor.id);
}

/**
 * **A HORDE CREATURE'S TOKENS GO, CARRYING THE COLLAPSE CUE** (the animation contract's §3), and
 * the collapse is told on `azerothHordeCollapse` (a talent that reads a collapse by choice - 04's
 * Sacrificial Strength - listens there). The active GM's alone (`collapseRaise`).
 *
 * @param {Actor} actor  the creature's world actor
 * @param {{byChoice?: boolean, reason?: string, by?: object|null, ownerUuid?: string|null}} how
 */
export async function collapseHordeTokens(actor, how = {}) {
  const bond = bondOf(actor);
  const bodies = [];
  markCollapsing(actor);
  // **04's SACRIFICIAL STRENGTH** (Phase 4c-T): the allies within 10 feet of a creature collapsed by
  // choice, measured while its tokens still stand, and their temporary Health once they have gone.
  let sacrificial = null;
  if (how.byChoice === true) {
    try {
      const owner = docAt(how.ownerUuid ?? bond?.ownerUuid ?? null);
      const { sacrificialPlan } = await import("./necromancer-talents.mjs");
      const tokens = (game.scenes?.contents ?? []).flatMap(s => s.tokens.filter(tk => tk.actorId === actor.id));
      sacrificial = owner ? await sacrificialPlan(owner, tokens, { byChoice: true }) : null;
    } catch (err) {
      console.warn("azeroth-rpg | Sacrificial Strength", err);
    }
  }
  for (const scene of game.scenes ?? []) {
    const tokens = scene.tokens.filter(tk => tk.actorId === actor.id);
    if (!tokens.length) continue;
    const grid = scene.grid ?? {};
    const rows = tokens.map(tk => ({ sceneId: scene.id, tokenId: tk.id, from: { x: tk.x, y: tk.y }, width: tk.width, height: tk.height, sizeX: grid.sizeX ?? grid.size ?? 100, sizeY: grid.sizeY ?? grid.size ?? 100 }));
    bodies.push(...rows);
    const cue = collapseCue({ by: how.by ?? null, bodies: rows });
    try {
      await scene.deleteEmbeddedDocuments("Token", tokens.map(tk => tk.id), cue ? { [COLLAPSE_OPTION]: cue } : {});
    } catch (err) {
      console.warn("azeroth-rpg | horde collapse tokens", err);
    }
  }
  Hooks.callAll("azerothHordeCollapse", { ownerUuid: how.ownerUuid ?? bond?.ownerUuid ?? null, actor, bond, byChoice: how.byChoice === true, reason: how.reason ?? "span", bodies });
  if (sacrificial) {
    try {
      const { landSacrificial } = await import("./necromancer-talents.mjs");
      await landSacrificial(sacrificial);
    } catch (err) {
      console.warn("azeroth-rpg | Sacrificial Strength", err);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  The lead and the surge                                              */
/* ------------------------------------------------------------------ */

/**
 * **NAME A LEAD** (02 §7: *When you cast a spell, you may name another of your raised dead your
 * lead, from that creature's next turn*; *When your lead collapses, you may name another ... using
 * no action*). Refused in words where the creature is not one of this caster's raised dead, or
 * where a lead stands and no spell is being cast.
 *
 * @param {Actor} owner
 * @param {string} actorId  the creature's world actor id
 * @param {{casting?: boolean}} o
 */
export async function nameLead(owner, actorId, { casting = false } = {}) {
  const members = countedLeadable(owner);
  if (!members.some(m => m.id === actorId)) {
    ui.notifications?.warn(t("AZEROTH.Horde.Refuse.leadNotYours", { name: owner?.name ?? "" }));
    return false;
  }
  const current = leadOf(owner);
  if (current === actorId) return true;
  if (current && !casting) {
    ui.notifications?.warn(t("AZEROTH.Horde.Refuse.leadStands", { name: owner.name, lead: game.actors.get(current)?.name ?? "" }));
    return false;
  }
  await owner.setFlag(SCOPE, HORDE_LEAD_FLAG, namedLead({ named: actorId, current }));
  ui.notifications?.info(t("AZEROTH.Horde.LeadNamed", { name: game.actors.get(actorId)?.name ?? "", owner: owner.name }));
  return true;
}

/**
 * **THE LEAD TAKES ITS TURN** (the flag's `taken`): written on the active GM as the named creature
 * starts a turn, so the pending name becomes the lead.
 *
 * @param {Actor} actor  the horde creature starting its turn (world actor)
 */
export async function leadTaken(actor) {
  const bond = bondOf(actor);
  if (bond?.horde !== true || !bond.ownerUuid) return;
  let owner = null;
  try { owner = fromUuidSync(bond.ownerUuid); } catch { owner = null; }
  const flag = owner?.getFlag?.(SCOPE, HORDE_LEAD_FLAG) ?? null;
  if (flag?.id === actor.id && flag.taken === false && owner.isOwner) await owner.setFlag(SCOPE, HORDE_LEAD_FLAG, { ...flag, taken: true });
}

/**
 * **WHAT A HORDE CREATURE TAKES ON ITS TURN**, for `AzerothCombatant#_turnFacts`: null where the
 * creature is no horde creature, else `{halfActions, reactions}` off `rules/necromancer-features.mjs
 * #hordeTurnFacts`.
 *
 * @param {Actor} actor  the combatant's actor
 * @param {{ownTurn?: boolean}} o
 */
export function hordeTurnFor(actor, { ownTurn = false } = {}) {
  const world = worldActorOf(actor);
  const bond = bondOf(world);
  if (bond?.kind !== "raised" || bond.horde !== true || !bond.ownerUuid) return null;
  let owner = null;
  try { owner = fromUuidSync(bond.ownerUuid); } catch { owner = null; }
  if (!owner) return null;
  const self = hordeMember({ id: world.id, name: world.name, health: world.system?.health?.value ?? null, bond });
  // **THE RAISED DEAD ALONE** (the 4b review's S12): a creature Enslave the Dead holds never leads
  // (`leadFor` drops it), so the turn's facts read only the caster's raised dead - never every world
  // actor and every token on every scene inside `_turnFacts`.
  const members = hordeActorsOf(owner)
    .map(a => hordeMember({ id: a.id, name: a.name, health: a.system?.health?.value ?? null, bond: bondOf(a) }))
    .filter(Boolean);
  const surged = Boolean(world.getFlag?.(SCOPE, HORDE_SURGE_FLAG));
  return hordeTurnFacts({ self, members, flag: owner.getFlag?.(SCOPE, HORDE_LEAD_FLAG) ?? null, startingTurnOf: ownTurn ? world.id : null, surged });
}

/**
 * **COMMAND THE DEAD'S EMPOWERED LINE, LANDED** (*Each creature in your horde takes two Half-Actions
 * on its next turn*): the surge flag on every standing horde creature, taken at its next turn's
 * start (`AzerothCombatant#resetBudget`). The tokens, for the card.
 */
export async function hordeSurge(owner) {
  const refs = [];
  for (const actor of hordeActorsOf(owner)) {
    if ((actor.system?.health?.value ?? 0) <= 0) continue;
    if (actor.isOwner) await actor.setFlag(SCOPE, HORDE_SURGE_FLAG, { by: owner.uuid, at: Date.now() });
    const token = tokenOfActor(actor);
    if (token) refs.push({ actorId: actor.id, sceneId: token.parent.id, tokenId: token.id, name: token.name });
  }
  return refs;
}

/** The surge taken at a creature's own turn: its flag cleared once the budget has read it. */
export async function surgeTaken(actor) {
  const world = worldActorOf(actor);
  if (world?.getFlag?.(SCOPE, HORDE_SURGE_FLAG) && world.isOwner) await world.unsetFlag(SCOPE, HORDE_SURGE_FLAG);
}

/* ------------------------------------------------------------------ */
/*  Uses: the surge and Dark Ritual                                     */
/* ------------------------------------------------------------------ */

/**
 * **A NECROMANCER FEATURE'S USE, JUDGED BEFORE ANYTHING IS PAID** (`useFeature`'s `onUse.necro`):
 * Command the Dead's surge (a horde to surge), Dark Ritual's servant within 30 feet (through the one
 * chooser) and its Empowered line. Null where the Use stops here; the plan otherwise.
 */
export async function judgeNecroUse(actor, item, { onUse = {}, source = null } = {}) {
  // **04's FLESH, BONE AND DAMNED** (Phase 4c-T): a talent's Use, judged by its own door.
  if (onUse.necro) {
    const { judgeNecroTalentUse } = await import("./necromancer-talents.mjs");
    const plan = await judgeNecroTalentUse(actor, item, { onUse, source });
    return plan ? { kind: "talent", plan } : null;
  }
  // A Use offered elsewhere (Claim the Fallen, Grave Guard, Unending Dead) is refused from the
  // sheet in words, with nothing paid, as Another Timeline's is.
  if (onUse.offered) {
    ui.notifications?.warn(t(`AZEROTH.Horde.Offered.${onUse.offered}`, { name: actor.name, feature: item.name }));
    return null;
  }
  // Lichdom's Use binds the phylactery while a Long Rest's window stands; it pays nothing.
  if (onUse.phylactery) {
    const lines = await bindPhylactery(actor);
    for (const line of lines) ui.notifications?.info(line);
    return null;
  }
  if (onUse.hordeSurge) {
    const standing = hordeActorsOf(actor).filter(a => (a.system?.health?.value ?? 0) > 0);
    if (!standing.length) {
      ui.notifications?.warn(t("AZEROTH.Horde.Refuse.noHorde", { name: actor.name, feature: item.name }));
      return null;
    }
    return { kind: "surge" };
  }
  if (onUse.darkRitual) {
    const site = knightToken(actor, source);
    if (!site) {
      ui.notifications?.warn(t("AZEROTH.Raise.Refuse.noToken", { name: actor.name }));
      return null;
    }
    const { feetApart } = await import("../canvas/footprints.mjs");
    const servants = hordeActorsOf(actor).map(a => {
      const token = site.scene.tokens.find(tk => tk.actorId === a.id) ?? null;
      return { actor: a, token, feet: token ? feetApart(site.token, token) : null, health: a.system?.health?.value ?? 0 };
    }).filter(s => s.token && s.health > 0);
    const { chooseOption } = game.system.azeroth.workflows;
    const options = servants.map(s => ({
      key: s.actor.id, available: darkRitualJudgement({ servant: s, usesLeft: 1 }).ok, name: t("AZEROTH.Horde.ServantOption", { name: s.actor.name, health: s.health, feet: Math.round(s.feet ?? 0) }), description: ""
    }));
    if (!options.some(o => o.available)) {
      ui.notifications?.warn(t("AZEROTH.Horde.Refuse.noServantNear", { name: actor.name, feature: item.name, feet: DARK_RITUAL.feet }));
      return null;
    }
    const pick = await chooseOption(item, options, null, { prompt: t("AZEROTH.Horde.DarkRitualPrompt", { feature: item.name, feet: DARK_RITUAL.feet }) });
    const chosen = pick ? servants.find(s => s.actor.id === pick.key) ?? null : null;
    if (!chosen) return null;
    const essence = essenceOf(actor)?.value ?? 0;
    let empowered = false;
    if (essence >= DARK_RITUAL.essence) {
      const way = await chooseOption(item, [
        { key: "plain", available: true, name: t("AZEROTH.Horde.DarkRitualPlain"), description: "" },
        { key: "empowered", available: true, name: t("AZEROTH.Horde.DarkRitualEmpowered", { n: DARK_RITUAL.essence }), description: "" }
      ], null, { prompt: t("AZEROTH.Horde.EmpowerPrompt", { feature: item.name }) });
      if (!way) return null;
      empowered = way.key === "empowered";
    }
    const judged = darkRitualJudgement({ servant: chosen, usesLeft: item.system?.uses?.value ?? 1, empowered, essence });
    if (!judged.ok) {
      ui.notifications?.warn(t(`AZEROTH.Horde.Refuse.${judged.reason}`, { name: actor.name, feature: item.name, feet: DARK_RITUAL.feet }));
      return null;
    }
    return { kind: "darkRitual", actorId: chosen.actor.id, empowered, target: { actorId: chosen.actor.id, sceneId: site.scene.id, tokenId: chosen.token.id, name: chosen.token.name } };
  }
  return null;
}

/** What the Use does once it is paid for; the card's lines. `targets` the list the card records. */
export async function landNecroUse(actor, item, plan, { targets = null, onRisen = null } = {}) {
  if (!plan) return [];
  if (plan.kind === "talent") {
    const { landNecroTalentUse } = await import("./necromancer-talents.mjs");
    return landNecroTalentUse(actor, item, plan.plan, { targets, onRisen });
  }
  if (plan.kind === "surge") {
    const refs = await hordeSurge(actor);
    if (Array.isArray(targets)) targets.push(...refs);
    return [t("AZEROTH.Horde.Surged", { name: actor.name, n: refs.length })];
  }
  if (plan.kind === "darkRitual") {
    const servant = game.actors.get(plan.actorId) ?? null;
    if (!servant || (servant.system?.health?.value ?? 0) <= 0) return [t("AZEROTH.Horde.Refuse.noServant", { name: actor.name, feature: item.name })];
    if (Array.isArray(targets)) targets.push(plan.target);
    const health = servant.system?.health?.value ?? 0;
    const mana = darkRitualMana({ health, tier: actor.system?.tier ?? 1, grimSacrament: ranksOf(actor)("Grim Sacrament") });
    // **THE ESSENCE IS JUDGED, THEN TAKEN IN ITS QUEUE, AND A SHORT POOL IS SAID** (the 4b review's
    // S12): judged before the budget (`judgeNecroUse`), taken here with a spend that writes nothing
    // where the pool fell short since. **The Use is already paid for** (its budget and its use), so a
    // short pool falls back to the PLAIN ritual and says so (the fix runs' review), never a Use spent
    // for nothing.
    const fallback = [];
    let empowered = plan.empowered === true;
    if (empowered && !(await spendEssence(actor, DARK_RITUAL.essence))) {
      empowered = false;
      fallback.push(t("AZEROTH.Horde.DarkRitualPlainFallback", { name: actor.name, feature: item.name, n: DARK_RITUAL.essence }));
    }
    // A collapse that did not happen gives no Mana (S12), and the Essence comes back.
    if (!(await collapseHordeMember(actor, servant, { byChoice: true, reason: "darkRitual" }))) {
      if (empowered) await refundEssence(actor, DARK_RITUAL.essence);
      return [t("AZEROTH.Horde.Refuse.ritualNoCollapse", { name: actor.name, servant: servant.name, feature: item.name })];
    }
    const { manaPool } = await import("../rules/pools.mjs");
    const pool = manaPool(actor.poolSnapshot?.() ?? []);
    const moved = pool && mana > 0 ? await adjustPool(actor, { kind: pool.kind, name: pool.name }, mana) : { before: 0, after: 0 };
    const gained = Math.max(0, (moved.after ?? 0) - (moved.before ?? 0));
    const lines = [...fallback, t("AZEROTH.Horde.DarkRitualDone", { name: actor.name, servant: servant.name, n: gained, health })];
    if (empowered && gained > 0) {
      await actor.applyHealing?.(gained, { from: actor, feature: true, featureName: item.name });
      lines.push(t("AZEROTH.Horde.DarkRitualHealed", { name: actor.name, n: gained }));
    }
    return lines;
  }
  return [];
}

/* ------------------------------------------------------------------ */
/*  The offers: Claim the Fallen, Unending Dead, a plague rising        */
/* ------------------------------------------------------------------ */

/** Post an offer card whose buttons name their audience (D-779's `data-reaction-owner`). */
async function postOffer(holder, context, flags = {}) {
  const owners = (game.users?.contents ?? []).filter(u => holder.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const content = await foundry.applications.handlebars.renderTemplate(OFFER_TEMPLATE, { holderUuid: holder.uuid, ...context });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: holder }), content, whisper: owners,
    flags: { [SCOPE]: { kind: NECRO_OFFER_KIND, holder: holder.uuid, ...flags } }
  });
}

/** The Necromancers on a scene with a token there, and that token. */
function necromancersOn(scene) {
  const out = [];
  for (const token of scene?.tokens ?? []) {
    const actor = token.actor;
    if (actor?.type === "character" && essenceOf(actor) !== null) out.push({ actor, token });
  }
  return out;
}

/**
 * **CLAIM THE FALLEN'S OFFER** (02 §7: *When a living creature dies within 30 feet of you, you may
 * use your Reaction to cast Raise Dead or Animate Corpse on its corpse*): on the death watch's
 * `died`, for every Necromancer on the corpse's scene who holds the feature, knows a raise and is
 * within 30 feet - judged again at the press.
 */
async function offerClaim(dead) {
  const living = isLiving(creatureSnapshot({ type: dead.type, system: dead.system, race: dead.raceItem?.name ?? null }));
  if (!living) return;
  const { feetApart } = await import("../canvas/footprints.mjs");
  const corpses = dead.isToken && dead.token ? [dead.token] : (game.scenes?.contents ?? []).flatMap(s => s.tokens.filter(tk => tk.actor === dead));
  for (const corpse of corpses) {
    for (const { actor, token } of necromancersOn(corpse.parent)) {
      if (actor === dead || !actor.hasFeature?.(NECRO_FEATURES.claimTheFallen)) continue;
      const known = actor.items.filter(i => i.type === "spell").map(i => i.system?.identifier);
      const judged = claimFallenJudgement({ living, feet: feetApart(token, corpse), reactionLeft: reactionLeft(actor), known });
      if (!judged.ok) continue;
      const spells = judged.spells.map(k => ({ key: k, name: actor.items.find(i => i.type === "spell" && i.system?.identifier === k)?.name ?? k }));
      await postOffer(actor, {
        claim: true, text: t("AZEROTH.Horde.ClaimOffer", { name: actor.name, corpse: corpse.name, feet: CLAIM_THE_FALLEN.feet }),
        title: NECRO_FEATURES.claimTheFallen, sceneId: corpse.parent.id, corpseId: corpse.id,
        spells, essence: CLAIM_THE_FALLEN.essence, empowerable: (essenceOf(actor)?.value ?? 0) >= CLAIM_THE_FALLEN.essence
      }, { offer: "claim", corpse: { sceneId: corpse.parent.id, tokenId: corpse.id } });
    }
  }
}

/** Whether a creature may still spend a Reaction: out of a fight there is no budget to ask. */
function reactionLeft(actor) {
  return game.system.azeroth.workflows.turnBudgetRefusal?.(actor, "reaction") === null;
}

/**
 * **CLAIM THE FALLEN, PRESSED** (D-768's order): the corpse still a corpse in reach, the Reaction,
 * a known raise and - empowered - 1 Essence, judged; then the spell cast as a Reaction on that
 * corpse alone (`castSpell`'s `castAs`), its Mana paid unless empowered; the Essence taken once the
 * cast is made.
 *
 * @param {HTMLElement} button
 */
export async function claimFromCard(button) {
  const holder = docAt(button?.dataset?.holderUuid);
  if (holder?.documentName !== "Actor" || !holder.isOwner) return null;
  const key = button.dataset.spell;
  const empowered = button.dataset.empowered === "true";
  const scene = game.scenes.get(button.dataset.sceneId) ?? null;
  const corpse = scene?.tokens?.get(button.dataset.corpseId) ?? null;
  const spell = holder.items.find(i => i.type === "spell" && i.system?.identifier === key) ?? null;
  const site = knightToken(holder, null);
  const { feetApart } = await import("../canvas/footprints.mjs");
  const judged = claimFallenJudgement({
    living: true, feet: corpse && site && site.scene === scene ? feetApart(site.token, corpse) : null,
    reactionLeft: reactionLeft(holder), known: spell ? [key] : [], empowered, essence: essenceOf(holder)?.value ?? 0
  });
  if (!judged.ok || !corpse || !spell) {
    ui.notifications?.warn(t(`AZEROTH.Horde.Refuse.claim.${judged.reason ?? "gone"}`, { name: holder.name, feature: NECRO_FEATURES.claimTheFallen, feet: CLAIM_THE_FALLEN.feet }));
    return null;
  }
  PENDING_CLAIM.set(holder.uuid, corpse.id);
  try {
    // **THE EMPOWERED PRICE RIDES THE CAST** (the 4b review's MUST-FIX 2): `free.essence` is judged in
    // `castSpell`'s one Essence check with the empower lines, the grafts and Skeletal Mastery's line,
    // before the budget, and paid in the payment block - never taken after the cast, where a failed
    // spend left a free raise.
    const { castSpell } = game.system.azeroth.workflows;
    return await castSpell({
      actor: holder, spell, source: refOf(site.token), castAs: "reaction",
      free: empowered ? { by: NECRO_FEATURES.claimTheFallen, action: true, essence: CLAIM_THE_FALLEN.essence } : null
    });
  } finally {
    PENDING_CLAIM.delete(holder.uuid);
  }
}

/**
 * **AN OFFER CARD'S ONE PRESS** (`effects/card-presses.mjs#claimCardPress`; the 4b review's
 * MUST-FIX 3): recorded on the card before anything is spent, on the active GM's client where this
 * one may not write it - so a double press, or two owners pressing at once, lands once. A card the
 * press cannot be recorded on refuses in words. True where this press holds it.
 */
async function claimOffer(message, press) {
  if (!message) {
    ui.notifications?.warn(game.i18n.localize("AZEROTH.Card.ActorGone"));
    return false;
  }
  const { claimCardPress } = await import("./card-presses.mjs");
  const claimed = await claimCardPress(message, { kind: "once", press });
  if (!claimed.ok) {
    ui.notifications?.warn(game.i18n.localize(claimed.reason === "AZEROTH.TalentLine.Pressed" ? "AZEROTH.Horde.Refuse.pressed" : (claimed.reason ?? "AZEROTH.Horde.Refuse.pressed")));
    return false;
  }
  return true;
}

/** A document by uuid, quietly. */
function docAt(uuid) {
  if (!uuid) return null;
  try { return fromUuidSync(uuid); } catch { return null; }
}

/**
 * **ONE OF THE RAISED DEAD DROPS** (the death watch's `raisedDown`): ONE judgement asks every
 * source that may stand it again (`standAgainJudgement`, the 4b review's S11: Unending Dead now,
 * Restless Bones in 4c) - an offer where one may, else it collapses (*A creature that collapses
 * leaves no corpse*; the lead's Q1). An offer in a fight waits for the Necromancer's next turn; out
 * of one it waits only until the world's clock moves on (`collapseFallenOnClock`).
 */
async function onRaisedDown(actor) {
  const world = worldActorOf(actor);
  const bond = bondOf(world);
  if (bond?.horde !== true || !bond.ownerUuid) return;
  const owner = docAt(bond.ownerUuid);
  if (!owner) return;
  const ownerToken = tokenOfActor(owner);
  const own = tokenOfActor(world, ownerToken?.parent ?? null);
  const { feetApart } = await import("../canvas/footprints.mjs");
  const feet = ownerToken && own && ownerToken.parent === own.parent ? feetApart(ownerToken, own) : null;
  const unending = unendingDeadJudgement({
    held: owner.hasFeature?.(NECRO_FEATURES.unendingDead) === true, stoodAgain: Boolean(world.getFlag?.(SCOPE, STOOD_AGAIN_FLAG)),
    feet, essence: essenceOf(owner)?.value ?? 0, health: world.system?.health?.value ?? 0
  });
  const fight = owner.activeFight?.() ?? null;
  // **04's BLOATED DEAD AND RESTLESS BONES** (Phase 4c-T): the burst lands from the body before it
  // stands or collapses, and Restless Bones is the judgement's source that asks nobody.
  const talents = await import("./necromancer-talents.mjs");
  try {
    await talents.bloatedDeadOn(owner, world);
  } catch (err) {
    console.warn("azeroth-rpg | Bloated Dead", err);
  }
  const restless = talents.restlessJudged(owner, world);
  const judged = standAgainJudgement({ sources: { "restless-bones": restless, "unending-dead": unending }, inFight: Boolean(fight?.started) });
  if (judged.stands === "restless-bones") {
    await talents.restlessStands(owner, world, restless, { inFight: Boolean(fight?.started) });
    return;
  }
  if (!judged.collapse) {
    if (judged.offers.includes("unending-dead")) {
      await postOffer(owner, {
        unending: true, title: NECRO_FEATURES.unendingDead, servantUuid: world.uuid,
        text: t(judged.waits === "clock" ? "AZEROTH.Horde.UnendingOfferClock" : "AZEROTH.Horde.UnendingOffer", { name: world.name, owner: owner.name, n: UNENDING_DEAD.essence })
      }, { offer: "unending", servant: world.uuid, unendingDead: true });
    }
    return;
  }
  await collapseNow(owner, world, { byChoice: false, reason: "dead", by: refOf(ownerToken) });
}

/**
 * **OUT OF A FIGHT, AN UNANSWERED OFFER ENDS WHEN THE CLOCK MOVES** (the 4b review's S11): every
 * horde creature still at 0 Health whose Necromancer is in no started fight collapses once the
 * world's clock moves on. The active GM's alone.
 */
export async function collapseFallenOnClock() {
  if (!game.users?.activeGM?.isSelf) return 0;
  let n = 0;
  for (const actor of game.actors?.contents ?? []) {
    const bond = bondOf(actor);
    if (bond?.kind !== "raised" || bond.horde !== true || (actor.system?.health?.value ?? 1) > 0) continue;
    const owner = docAt(bond.ownerUuid);
    if (!owner || owner.activeFight?.()?.started) continue;
    await collapseNow(owner, actor, { byChoice: false, reason: "dead", by: null });
    n += 1;
  }
  return n;
}

/**
 * **UNENDING DEAD, PRESSED** (02 §7: *you may spend 1 Essence. It stands again with half its
 * Health. Each creature stands again this way once*), judged again, then paid, then stood, with a
 * feature card recording it in `risen` for its rising cue. **Let it fall** collapses it.
 */
export async function unendingFromCard(button, message = null) {
  const holder = docAt(button?.dataset?.holderUuid);
  const servant = worldActorOf(docAt(button?.dataset?.servantUuid));
  if (holder?.documentName !== "Actor" || !holder.isOwner || !servant) {
    ui.notifications?.warn(t("AZEROTH.Horde.Refuse.unending.gone", { name: holder?.name ?? "" }));
    return null;
  }
  // **LET IT FALL IS A COLLAPSE BY YOUR OWN CHOICE** (the lead's Q4: *"I agree"*), and the card's
  // one press (`claimCardPress`): a second press is refused in words.
  if (button.dataset.fall === "true") {
    if ((servant.system?.health?.value ?? 0) > 0) return null;
    if (!(await claimOffer(message, "unendingDead"))) return null;
    await collapseHordeMember(holder, servant, { byChoice: true, reason: "dead" });
    return null;
  }
  const ownerToken = tokenOfActor(holder);
  const own = tokenOfActor(servant, ownerToken?.parent ?? null);
  const { feetApart } = await import("../canvas/footprints.mjs");
  const judged = unendingDeadJudgement({
    held: holder.hasFeature?.(NECRO_FEATURES.unendingDead) === true, stoodAgain: Boolean(servant.getFlag?.(SCOPE, STOOD_AGAIN_FLAG)),
    feet: ownerToken && own && ownerToken.parent === own.parent ? feetApart(ownerToken, own) : null,
    essence: essenceOf(holder)?.value ?? 0, health: servant.system?.health?.value ?? 0
  });
  if (!judged.ok || !servant.isOwner) {
    ui.notifications?.warn(t(`AZEROTH.Horde.Refuse.unending.${judged.ok ? "notYours" : judged.reason}`, { name: servant.name, owner: holder.name, feet: UNENDING_DEAD.feet }));
    return null;
  }
  // The card's one press, claimed before the Essence is spent (D-773's review): a second press is refused.
  if (!(await claimOffer(message, "unendingDead"))) return null;
  if (!(await spendEssence(holder, UNENDING_DEAD.essence))) {
    ui.notifications?.warn(t("AZEROTH.Horde.Refuse.unending.noEssence", { name: servant.name, owner: holder.name, feet: UNENDING_DEAD.feet }));
    // **THE OFFER POSTED AGAIN** (the fix runs' review): the press is spent and nothing was paid, so
    // a fresh card stands the offer while the servant still waits at 0 Health - it collapses as an
    // unanswered offer does (the Necromancer's next turn start, or the clock out of a fight).
    await repostUnending(holder, servant);
    return null;
  }
  const health = standAgainHealth(servant.system?.health?.max ?? 0);
  await servant.update({ "system.health.value": health, [`flags.${SCOPE}.${STOOD_AGAIN_FLAG}`]: true });
  const status = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  if (servant.statuses?.has?.(status)) await servant.toggleStatusEffect?.(status, { active: false });
  await postFeatureCard(holder, { key: "unending-dead", text: t("AZEROTH.Horde.StoodAgain", { name: servant.name, n: health }), risen: own ? [{ sceneId: own.parent.id, tokenIds: [own.id] }] : [] });
  return true;
}

/** Unending Dead's offer posted again after a press whose Essence could not be paid. */
async function repostUnending(holder, servant) {
  if ((servant.system?.health?.value ?? 1) > 0 || !game.actors?.has?.(servant.id)) return null;
  const waits = holder.activeFight?.()?.started ? "turn" : "clock";
  return postOffer(holder, {
    unending: true, title: NECRO_FEATURES.unendingDead, servantUuid: servant.uuid,
    text: t(waits === "clock" ? "AZEROTH.Horde.UnendingOfferClock" : "AZEROTH.Horde.UnendingOffer", { name: servant.name, owner: holder.name, n: UNENDING_DEAD.essence })
  }, { offer: "unending", servant: servant.uuid, unendingDead: true });
}

/**
 * A one-line feature card the animation layer reads (`animation/records.mjs#cardRecord`): its key,
 * its user's token, the creatures it touched and what rose.
 */
export async function postFeatureCard(actor, { key, text, targets = [], risen = [], source = null } = {}) {
  if (!actor || !text) return null;
  const src = source ?? refOf(tokenOfActor(actor));
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line">${foundry.utils.escapeHTML(text)}</p></div></div>`,
    flags: { [SCOPE]: {
      kind: "feature",
      source: src ?? null,
      featureKey: key,
      casting: false,
      success: true,
      targets: targets.filter(Boolean),
      ...(risen.length ? { risen } : {})
    } }
  });
}

/* ------------------------------------------------------------------ */
/*  Plague of Undeath                                                   */
/* ------------------------------------------------------------------ */

/**
 * **PLAGUE OF UNDEATH ON A CREATURE THAT FAILED** (07: *On a failure it contracts every disease
 * 09-EXPLORATION-AND-HAZARDS lists, each with its own onset and recovery. A creature that failed
 * takes 4 Shadow damage at the start of each of its turns for the duration. When a creature that
 * failed dies before the duration ends, it rises as a Plagued Ghoul under your control*): every
 * disease through the one affliction writer, the tick (D-770's carrier, laid by this door - the
 * census's `failedArea` row), and the mark a death reads. On the client that rolled the Test.
 *
 * @param {Actor} actor  the creature that failed
 * @param {ChatMessage} message  the spell card
 */
export async function plagueFailed(actor, message) {
  const flags = message?.flags?.[SCOPE] ?? {};
  const casterUuid = typeof flags.caster === "string" ? flags.caster : null;
  const caster = docAt(casterUuid);
  if (!actor || !caster) return [];
  const lines = [];
  // The living alone (*Each living creature in the area*).
  if (!isLiving(creatureSnapshot({ type: actor.type, system: actor.system, race: actor.raceItem?.name ?? null }))) return lines;
  try {
    const { afflictDisease } = await import("../dice/afflictions-workflows.mjs");
    for (const key of Object.keys(DISEASES)) await afflictDisease({ victim: actor, key, by: caster });
  } catch (err) {
    console.warn("azeroth-rpg | Plague of Undeath diseases", err);
  }
  // *1 minute*: ten rounds, doubled by 02 §7's Lasting where the cast bought it (the 4b review's
  // MUST-FIX 6) - the tick's count and the span a death may raise a ghoul in, both.
  const rounds = plagueRounds({ lasting: flags.empower?.lasting === true });
  const timing = roundsOrClock(actor, rounds) ?? {};
  const { layTickOn } = await import("./ticks.mjs");
  // **SHADOW SPELLPOWER REACHES THE TICK** (07 §9: *Where a spell deals damage over time,
  // Spellpower raises the ongoing damage and not the initial hit*; a Death spell's damage is Shadow,
  // D-918/D-941; the 4b review's S12): the caster's Shadow Spellpower lands at each turn.
  const tick = {
    kind: "damage", type: "shadow", amount: 4, rounds, until: "", when: "startOfTurn", spellpower: true,
    source: casterUuid, castUuid: flags.spellUuid ?? null, cast: flags.cast ?? null, name: flags.spellName ?? message.flags?.[SCOPE]?.title ?? "Plague of Undeath"
  };
  const until = (game.time?.worldTime ?? 0) + rounds * (CONFIG.time?.roundTime ?? 6);
  const made = actor.isOwner ? await layTickOn(actor, { tick, img: flags.spellImg ?? null, origin: casterUuid, timing }) : null;
  if (made) {
    await made.update({ [`flags.${SCOPE}.${PLAGUE_RISE_FLAG}`]: { casterUuid, until } });
    lines.push(t("AZEROTH.Horde.PlagueTick", { name: actor.name }));
  }
  return lines;
}

/** Plague of Undeath's *1 minute* in rounds, doubled by 02 §7's Lasting. */
export function plagueRounds({ lasting = false } = {}) {
  return lasting === true ? 20 : 10;
}

/**
 * **A PLAGUED CREATURE DIES** (the death watch's `died`): the caster's next turn will stand it as a
 * Plagued Ghoul. **The rising rides the corpse's own token** (the 4b review's MUST-FIX 4): one write
 * a corpse, so two plagued deaths at once can never write over each other's place in a queue - and
 * the mark is the evidence the GM's raise handler reads before the ghoul stands (MUST-FIX 3).
 */
async function plagueDied(dead) {
  const now = game.time?.worldTime ?? 0;
  const mark = [...(dead.effects ?? [])].map(e => e.flags?.[SCOPE]?.[PLAGUE_RISE_FLAG]).find(m => m?.casterUuid && !(Number(m.until) < now));
  if (!mark) return;
  const caster = docAt(mark.casterUuid);
  if (!caster) return;
  const token = dead.isToken && dead.token ? dead.token : tokenOfActor(dead);
  if (!token || token.getFlag?.(SCOPE, PLAGUE_RISING_TOKEN_FLAG)) return;
  await token.update({ [`flags.${SCOPE}.${PLAGUE_RISING_TOKEN_FLAG}`]: { casterUuid: caster.uuid, diedAt: now, offered: false } });
}

/** The corpse tokens on every scene whose plague rising for this caster has not been offered yet. */
function risingsFor(owner) {
  const out = [];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      const r = token.getFlag?.(SCOPE, PLAGUE_RISING_TOKEN_FLAG);
      if (r?.casterUuid === owner.uuid && r.offered !== true) out.push(token);
    }
  }
  return out.sort((a, b) => (a.getFlag(SCOPE, PLAGUE_RISING_TOKEN_FLAG).diedAt ?? 0) - (b.getFlag(SCOPE, PLAGUE_RISING_TOKEN_FLAG).diedAt ?? 0) || a.id.localeCompare(b.id));
}

/**
 * **THE CASTER'S TURN STARTS** (the active GM's `_onStartTurn`): every plague ghoul queued is
 * offered; and every one of the raised dead still at 0 Health with no offer standing collapses
 * (*bound until ... die*).
 *
 * @param {Actor} owner
 */
export function hordeTurnStart(owner) {
  if (!owner || owner.type !== "character") return Promise.resolve();
  // One turn start for one caster at a time on this client (MUST-FIX 4's chain).
  return inOrder(`plague:${owner.uuid}`, () => hordeTurnStartNow(owner));
}

async function hordeTurnStartNow(owner) {
  // A queue an older world wrote on the caster: read once, cleared, and offered with the rest.
  const legacy = owner.getFlag?.(SCOPE, PLAGUE_RISINGS_FLAG) ?? [];
  if (legacy.length && owner.isOwner) {
    await owner.unsetFlag(SCOPE, PLAGUE_RISINGS_FLAG);
    for (const row of legacy) {
      const token = game.scenes.get(row.sceneId)?.tokens?.get(row.tokenId) ?? null;
      if (token && !token.getFlag?.(SCOPE, PLAGUE_RISING_TOKEN_FLAG)) await token.update({ [`flags.${SCOPE}.${PLAGUE_RISING_TOKEN_FLAG}`]: { casterUuid: owner.uuid, diedAt: game.time?.worldTime ?? 0, offered: false } });
    }
  }
  for (const token of risingsFor(owner)) {
    // Marked offered first, so a second turn start offers it once.
    await token.update({ [`flags.${SCOPE}.${PLAGUE_RISING_TOKEN_FLAG}.offered`]: true });
    await postOffer(owner, {
      rising: true, title: game.i18n.localize("AZEROTH.Horde.PlagueRiseTitle"), sceneId: token.parent.id, corpseId: token.id,
      text: t("AZEROTH.Horde.PlagueRiseOffer", { name: token.name, owner: owner.name })
    }, { offer: "rising", corpse: { sceneId: token.parent.id, tokenId: token.id }, hordeRise: true });
  }
  // **04's RESTLESS BONES** (*at the start of your next turn*): the skeletons held up stand first.
  try {
    const { restlessTurnStart } = await import("./necromancer-talents.mjs");
    await restlessTurnStart(owner);
  } catch (err) {
    console.warn("azeroth-rpg | Restless Bones", err);
  }
  for (const actor of hordeActorsOf(owner)) {
    if ((actor.system?.health?.value ?? 1) > 0) continue;
    await collapseHordeMember(owner, actor, { byChoice: false, reason: "dead" });
  }
}

/**
 * **A PLAGUE GHOUL, STOOD** (pressed on its card): the places judged on the caster's client - the
 * one chooser where a ghoul would pass them, before anything stands - and Grafted Flesh's grafts
 * (the 4b review's S9), then the card's one press claimed, the grafts' Essence paid, and the GM's
 * raise through the rising row naming THIS corpse (MUST-FIX 3: the handler reads its rising mark,
 * claims it and marks it raised), and a summon card under `horde:rise` recording what rose.
 */
export async function risingFromCard(button, message = null) {
  const holder = docAt(button?.dataset?.holderUuid);
  if (holder?.documentName !== "Actor" || !holder.isOwner) return null;
  const scene = game.scenes.get(button.dataset.sceneId) ?? null;
  const corpse = scene?.tokens?.get(button.dataset.corpseId) ?? null;
  const site = knightToken(holder, null);
  const spell = holder.items.find(i => i.type === "spell" && i.system?.identifier === "plague-of-undeath") ?? null;
  const why = corpse ? risingRefusal({ mark: corpse.getFlag?.(SCOPE, PLAGUE_RISING_TOKEN_FLAG) ?? null, casterUuid: holder.uuid, corpse: corpse.getFlag?.(SCOPE, CORPSE_FLAG) ?? null }) : "risingGone";
  if (!scene || !corpse || !site || !spell || why) {
    ui.notifications?.warn(t(why && why !== "risingGone" ? `AZEROTH.Raise.Refuse.${why}` : "AZEROTH.Horde.Refuse.risingGone", { name: corpse?.name ?? holder.name, spell: spell?.name ?? "", entry: "Plagued Ghoul" }));
    return null;
  }
  // **A GM TO WRITE THE RISING, ASKED WITH THE OTHER REFUSALS** (the final review's S4; D-768's order,
  // `gm-writes.mjs`): the raise goes through the GM's client, so with none online the press is refused
  // in words before the card's one press is claimed or a graft's Essence is spent.
  if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) {
    ui.notifications?.warn(t("AZEROTH.Raise.Refuse.noGM", { name: holder.name, spell: spell.name, entry: "Plagued Ghoul" }));
    return null;
  }
  const members = countedMembers(membersOf(holder));
  const capacity = capacityOf(holder);
  const adding = [{ entry: "Plagued Ghoul" }];
  const judged = hordeRefusal({ members, adding, capacity });
  let collapse = [];
  if (judged.refusal) {
    ui.notifications?.warn(t("AZEROTH.Raise.Refuse.exceeds", { name: holder.name, spell: spell.name, n: capacity.total }));
    return null;
  }
  if (judged.collapse > 0) {
    collapse = await chooseCollapse(spell, members, judged.collapse, { capacity, adding });
    if (!collapse) return null;
  }
  // **GRAFTED FLESH ON A PLAGUE GHOUL** (04: *a Risen Zombie or a Plagued Ghoul you raise may take
  // one graft*; S9): the one chooser, judged with the Essence held, before anything is paid.
  const menu = graftMenu({ entry: "Plagued Ghoul", stitched: false, surgeonsHand: ranksOf(holder)("Surgeon's Hand"), graftedFlesh: ranksOf(holder)("Grafted Flesh") });
  let picks = [];
  let graftCost = 0;
  if (menu.max && essenceOf(holder)) {
    const chosen = await chooseGrafts(holder, spell, "Plagued Ghoul", menu);
    if (chosen === null) return null;
    picks = chosen;
    if (picks.length) {
      const judgedGrafts = graftPlan({ menu, picks, pool: essenceOf(holder), practicedStitcher: ranksOf(holder)("Practiced Stitcher") });
      if (!judgedGrafts.ok) return refuseGraft(spell, judgedGrafts);
      graftCost = judgedGrafts.cost;
    }
  }
  // The card's one press (MUST-FIX 3), then the grafts' Essence, then the GM's raise.
  if (!(await claimOffer(message, "hordeRise"))) return null;
  if (graftCost > 0 && !(await spendEssence(holder, graftCost))) {
    ui.notifications?.warn(t("AZEROTH.Graft.Refuse.short", { spell: spell.name, n: graftCost, name: "" }));
    // The press is spent and nothing rose: the rising is offered again at the next turn start.
    await reofferRising(holder, scene, corpse);
    return null;
  }
  try {
    const done = await askGM(RAISE_QUERY, raiseQueryHandler, {
      horde: true, rising: true, ownerUuid: holder.uuid, key: "plague-of-undeath", sceneId: site.scene.id, tokenId: site.token.id,
      corpses: [corpse.id], corpseSceneId: scene.id, entries: ["Plagued Ghoul"], grafts: [picks], collapse, name: spell.name
    });
    const risen = risenRecord({ sceneId: done?.sceneId, tokenIds: done?.tokenIds ?? [] });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: holder }),
      content: `<div class="azeroth azeroth-card azeroth-card-feature"><div class="azeroth-card-body"><p class="azeroth-card-line">${foundry.utils.escapeHTML(t("AZEROTH.Horde.PlagueRose", { name: corpse.name, owner: holder.name }))}</p></div></div>`,
      flags: { [SCOPE]: {
        kind: "summon", featureKey: HORDE_RISE_KEY, source: refOf(site.token), risen: risen ? [risen] : [],
        // The graft stitching on a ghoul Grafted Flesh reached (the animation contract's section 1).
        ...(done?.grafted?.length ? { [RAISED_WITH_FLAG]: raisedWithOf({ sceneId: done.sceneId, grafted: done.grafted }) } : {})
      } }
    });
    return done;
  } catch (err) {
    ui.notifications?.warn(err.message);
    // A refused rising gives its grafts' Essence back (S10), and is offered again at the caster's
    // next turn start (the fix runs' review, MUST-FIX 2): the card's one press is spent.
    const back = await refundEssence(holder, graftCost);
    if (back > 0) ui.notifications?.info(t("AZEROTH.Horde.EssenceRefunded", { name: holder.name, n: back }));
    await reofferRising(holder, scene, corpse);
    return null;
  }
}

/**
 * **A REFUSED RISING, OFFERED AGAIN** (the fix runs' review, MUST-FIX 2): the corpse's rising mark
 * put back to `offered: false` on the GM's client (`hordeQueryHandler`'s `reoffer`), so the caster's
 * next turn start posts a fresh card. Said in words where it holds; quiet where the rising is gone.
 */
async function reofferRising(holder, scene, corpse) {
  try {
    const done = await askGM(HORDE_QUERY, hordeQueryHandler, { act: "reoffer", ownerUuid: holder.uuid, how: { sceneId: scene.id, tokenId: corpse.id } });
    if (done?.reoffered) ui.notifications?.info(t("AZEROTH.Horde.RisingReoffered", { name: corpse.name, owner: holder.name }));
  } catch (err) {
    console.warn("azeroth-rpg | plague rising offered again", err);
  }
}

/* ------------------------------------------------------------------ */
/*  Enslave the Dead                                                    */
/* ------------------------------------------------------------------ */

/**
 * **ENSLAVE THE DEAD, JUDGED BEFORE ANYTHING IS PAID** (07: *One undead creature that is not a
 * Boss, of your tier or lower ... It takes its own turn*): one target, its line, a GM to write the
 * control, and the places it will take - the collapse chooser where it would pass them. The plan
 * rides the spell card (`enslave`), which the failed Test's door reads; null where refused.
 */
export async function judgeEnslave(actor, spell, targets = []) {
  const refuse = (k, data = {}) => {
    ui.notifications?.warn(t(`AZEROTH.Horde.Refuse.enslave.${k}`, { name: actor.name, spell: spell.name, ...data }));
    return null;
  };
  if ((targets ?? []).length !== 1) return refuse("one");
  const ref = targets[0];
  const target = ref?.sceneId && ref?.tokenId ? game.scenes.get(ref.sceneId)?.tokens?.get(ref.tokenId)?.actor ?? null : game.actors.get(ref?.actorId) ?? null;
  if (!target) return refuse("one");
  const snap = creatureSnapshot({ type: target.type, system: target.system, race: target.raceItem?.name ?? null });
  // A creature bound to somebody else is a target (the lead's Q3): 07's target line names no bond.
  const refused = enslaveRefusal({
    undead: !isLiving(snap) && (target.system?.creatureType === "undead" || target.system?.undead === true),
    weightClass: target.system?.weightClass ?? null, tier: target.system?.tier ?? 1, casterTier: actor.system?.tier ?? 1
  });
  if (refused) return refuse(refused, { target: target.name });
  if (gmAbsentFor({ owned: [target.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("noGM");
  const members = countedMembers(membersOf(actor));
  const capacity = capacityOf(actor);
  const adding = [{ entry: target.name, controlled: true }];
  const judged = hordeRefusal({ members, adding, capacity });
  if (judged.refusal) return refuse("exceeds", { n: capacity.total });
  let collapse = [];
  if (judged.collapse > 0) {
    collapse = await chooseCollapse(spell, members, judged.collapse, { capacity, adding });
    if (!collapse) return null;
  }
  return { targetUuid: target.uuid, entry: target.name, collapse };
}

/**
 * **THE CONTROL LANDS** (the failed Test's door, `dice/chat.mjs`): through the active GM, who judges
 * the card's record again, collapses what the caster chose, lays the control for the hour and turns
 * the creature's tokens to the caster's side, remembering the side it held.
 */
export async function requestEnslave(actor, message) {
  const payload = { actorUuid: actor.uuid, messageId: message.id };
  let done = null;
  let refused = null;
  try {
    done = game.user.isGM ? await enslaveQueryHandler(payload, { user: game.user }) : await game.users.activeGM?.query(ENSLAVE_QUERY, payload, { timeout: 15000 });
    if (!game.user.isGM && !game.users.activeGM) refused = game.i18n.localize("AZEROTH.Bound.NoGM");
  } catch (err) {
    refused = err?.message ?? String(err);
  }
  // **A REFUSED CONTROL GIVES THE CAST BACK** (the 4b review's S5 and S10; D-997's shape): where the
  // GM's client refused - the places no longer hold, the creature gone - the Mana and the Essence the
  // card records as paid come back to the caster, once, and the card says so.
  if (refused || done?.refused) {
    const why = refused ?? done.refused;
    ui.notifications?.warn(why);
    const lines = await refundEnslave(message);
    for (const line of lines) ui.notifications?.info(line);
    return { laid: false, refused: why };
  }
  return done;
}

/**
 * **WHAT A REFUSED ENSLAVE GIVES BACK** (S5, S10): the price the card's plan records as paid (the
 * Mana in the pool it was paid from, through the knight's `refundRefusedRaise`, and the Essence
 * through the `refund` source), once a card - the card is marked refunded where this client may
 * write it, else through the card-press door.
 */
async function refundEnslave(message) {
  const flags = message?.flags?.[SCOPE] ?? {};
  const paid = flags.enslave?.paid ?? null;
  const caster = docAt(flags.caster);
  if (!paid || caster?.documentName !== "Actor") return [];
  const { claimCardPress } = await import("./card-presses.mjs");
  if (!(await claimCardPress(message, { kind: "once", press: "enslave" })).ok) return [];
  const lines = [];
  if (paid.pool && (Number(paid.amount) || 0) > 0) {
    const { refundRefusedRaise } = await import("./death-knight-necromancy.mjs");
    lines.push(...await refundRefusedRaise(caster, { pool: paid.pool, amount: Number(paid.amount) || 0, spell: flags.spellName ?? "" }));
  }
  const back = await refundEssence(caster, paid.essence ?? 0);
  if (back > 0) lines.push(t("AZEROTH.Horde.EssenceRefunded", { name: caster.name, n: back }));
  return lines;
}

/**
 * **THE GM's SIDE OF ENSLAVE THE DEAD** (`ENSLAVE_QUERY`): the card's record judged again, inside the
 * caster's own horde chain (S7), the places asked again off the horde as it stands (S5: a chosen
 * creature already gone is dropped, and a control that no longer fits is refused in words with
 * nothing laid), the chosen collapse, then the control: the effect for the hour (doubled by 02 §7's
 * Lasting the card records, MUST-FIX 6), the creature's tokens turned to the caster's side, and its
 * ownership given to the caster's owners for the duration (the lead's Q3). Answers `{laid}` or
 * `{laid: false, refused}`.
 */
export function enslaveQueryHandler(payload = {}, options = {}) {
  const message = game.messages?.get(payload?.messageId ?? "") ?? null;
  const casterUuid = message?.flags?.[SCOPE]?.caster ?? null;
  return inOrder(hordeKey(casterUuid), () => layEnslave(payload ?? {}, options ?? {}));
}

async function layEnslave({ actorUuid = null, messageId = null } = {}, { user = null } = {}) {
  if (!game.user?.isGM) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  const target = docAt(actorUuid);
  if (target?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const message = game.messages.get(messageId) ?? null;
  const flags = message?.flags?.[SCOPE] ?? {};
  const plan = flags.enslave ?? null;
  const caster = docAt(flags.caster);
  if (flags.identifier !== "enslave-the-dead" || flags.success !== true || !plan || plan.targetUuid !== target.uuid || !caster) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !(target.testUserPermission(user, "OWNER") || caster.testUserPermission(user, "OWNER"))) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  if ([...(target.effects ?? [])].some(e => e.flags?.[SCOPE]?.[ENSLAVED_FLAG])) return { laid: false, reason: "already" };
  // **THE PLACES, ASKED AGAIN** (S5): a creature chosen to collapse that is already gone is dropped,
  // and the control is refused in words where what is left no longer makes room.
  const members = countedMembers(membersOf(caster));
  const standing = new Set(members.map(m => String(m.id)));
  const removing = (plan.collapse ?? []).map(String).filter(id => standing.has(id));
  if (!collapseEnough({ members, remove: removing, adding: [{ entry: plan.entry ?? target.name, controlled: true }], capacity: capacityOf(caster) })) {
    return { laid: false, refused: t("AZEROTH.Horde.Refuse.enslave.places", { name: caster.name, spell: flags.spellName ?? "", target: target.name, n: capacityOf(caster).total }) };
  }
  for (const id of removing) {
    const m = game.actors.get(id) ?? docAt(id);
    if (!m) continue;
    if (bondOf(worldActorOf(m))?.horde === true) await collapseNow(caster, worldActorOf(m), { byChoice: true, reason: "capacity", by: null });
    else await endEnslaved(m, { reason: "capacity" });
  }
  const tokens = target.isToken && target.token ? [target.token] : (game.scenes?.contents ?? []).flatMap(s => s.tokens.filter(tk => tk.actorId === target.id && tk.actorLink));
  const casterToken = tokenOfActor(caster);
  const side = casterToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  const restore = tokens.map(tk => ({ uuid: tk.uuid, disposition: tk.disposition }));
  for (const tk of tokens) if (tk.disposition !== side) await tk.update({ disposition: side });
  // **THE NECROMANCER'S PLAYER CONTROLS IT** (the lead's Q3: *"Yes"*): every non-GM owner of the
  // caster takes OWNER on the creature for the duration, beside whatever it held - a creature bound
  // to another character keeps that bond and that owner (D0's reading) - and exactly that grant is
  // taken back at the end (`enslaveRestore`).
  const owners = Object.entries(caster.ownership ?? {}).filter(([id, level]) => id !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && !game.users.get(id)?.isGM).map(([id]) => id);
  const prior = foundry.utils.deepClone(target.ownership ?? {});
  const grant = enslaveGrant(prior, owners);
  if (grant.granted.length) await target.update({ ownership: foundry.data.operators.ForcedReplacement.create(grant.ownership) });
  const minutes = flags.empower?.lasting === true ? 120 : 60;
  const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [{
    name: flags.spellName ?? "Enslave the Dead", img: flags.spellImg ?? "icons/svg/mystery-man.svg", origin: caster.uuid,
    description: `<p>${t("AZEROTH.Horde.EnslavedText", { name: target.name, owner: caster.name })}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    ...(minuteOrHour(target, minutes) ?? {}),
    flags: { [SCOPE]: { [ENSLAVED_FLAG]: { casterUuid: caster.uuid, casterName: caster.name, entry: plan.entry ?? target.name, since: Date.now(), restore, ownership: { prior, granted: grant.granted } } } }
  }]);
  return { laid: Boolean(effect) };
}

/** The hour as the world's clock or the fight's rounds count it. */
function minuteOrHour(actor, minutes) {
  return roundsOrClock(actor, minutes * 10);
}

/**
 * **THE CONTROL ENDS - THE CREATURE IS HANDED BACK, NEVER DELETED** (the plan: *release hands the
 * creature back and never deletes it*): the sides it held put back, the effect gone. The active GM.
 */
export async function endEnslaved(actor, { reason = "release" } = {}) {
  const effects = [...(actor?.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[ENSLAVED_FLAG]);
  if (!effects.length) return false;
  await handBack(actor, effects[0].flags[SCOPE][ENSLAVED_FLAG]);
  await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id), { azerothEnslaveEnded: reason });
  return true;
}

/**
 * **THE CREATURE HANDED BACK** (the plan: *release hands the creature back and never deletes it*;
 * the lead's Q3): the sides its tokens held, the ownership the control granted taken back (a GM's
 * later edit wins), and a card naming it - the control's end, which the animation plays
 * (`ENSLAVE_END_KEY`). The active GM's.
 */
async function handBack(actor, record) {
  await restoreSides(record);
  const own = record?.ownership ?? null;
  if (actor && own && Array.isArray(own.granted) && own.granted.length) {
    const ownership = enslaveRestore({ current: actor.ownership ?? {}, prior: own.prior ?? {}, granted: own.granted });
    await actor.update({ ownership: foundry.data.operators.ForcedReplacement.create(ownership) });
  }
  const caster = docAt(record?.casterUuid);
  const token = actor?.isToken && actor.token ? actor.token : tokenOfActor(actor);
  if (caster) await postFeatureCard(caster, {
    key: ENSLAVE_END_KEY, text: t("AZEROTH.Horde.EnslaveEnded", { name: actor?.name ?? record?.entry ?? "", owner: caster.name }),
    targets: token ? [{ actorId: actor.id, sceneId: token.parent.id, tokenId: token.id, name: token.name }] : []
  });
}

async function restoreSides(record) {
  for (const row of record?.restore ?? []) {
    const token = docAt(row.uuid);
    if (token?.documentName === "Token" && Number.isInteger(row.disposition) && token.disposition !== row.disposition) await token.update({ disposition: row.disposition });
  }
}

/* ------------------------------------------------------------------ */
/*  Lichdom's phylactery                                                */
/* ------------------------------------------------------------------ */

/**
 * **A LONG REST OPENS THE PHYLACTERY'S WINDOW** (02 §7's Lichdom: *When you finish a Long Rest, you
 * may bind yourself to a phylactery you carry*): the flag Lichdom's Use binds under, written by the
 * Long Rest door. A notification line where a Phylactery is carried, or none.
 */
export async function openPhylacteryWindow(actor) {
  if (!actor?.hasFeature?.(NECRO_FEATURES.lichdom) || !actor.isOwner) return [];
  await actor.setFlag(SCOPE, PHYLACTERY_WINDOW_FLAG, { at: game.time?.worldTime ?? 0 });
  return actor.items.some(i => i.type === "gear" && i.name === PHYLACTERY.name) ? [t("AZEROTH.Lich.WindowOpen", { name: actor.name })] : [];
}

/** The flag that holds a Long Rest's window to bind a phylactery open. */
export const PHYLACTERY_WINDOW_FLAG = "phylacteryWindow";

/**
 * Lichdom's Use: refused in words outside a Long Rest's window - which now closes after its hour
 * (`phylacteryWindowOpen`; S12) - else the binding, and a card naming the lich for its cue
 * (`LICH_BIND_KEY`).
 */
async function bindPhylactery(actor) {
  const open = actor?.getFlag?.(SCOPE, PHYLACTERY_WINDOW_FLAG) ?? null;
  if (!phylacteryWindowOpen(open, game.time?.worldTime ?? 0)) {
    if (open && actor.isOwner) await actor.unsetFlag(SCOPE, PHYLACTERY_WINDOW_FLAG);
    ui.notifications?.warn(t("AZEROTH.Lich.NoWindow", { name: actor?.name ?? "" }));
    return [];
  }
  const lines = await bindPhylacteryAtRest(actor);
  if (lines.length && actor.isOwner) await actor.unsetFlag(SCOPE, PHYLACTERY_WINDOW_FLAG);
  if (lines.length) await postFeatureCard(actor, { key: LICH_BIND_KEY, text: lines[0] });
  return lines;
}

/**
 * **THE BINDING** (*You have one phylactery at a time*): the one chooser over the Phylacteries
 * carried, the bond written on the lich and on the item, any other item's bond cleared. The line, or
 * none where the chooser kept what stood.
 */
export async function bindPhylacteryAtRest(actor) {
  if (!actor?.hasFeature?.(NECRO_FEATURES.lichdom)) return [];
  const carried = actor.items.filter(i => i.type === "gear" && i.name === PHYLACTERY.name);
  if (!carried.length) return [];
  const bound = actor.getFlag?.(SCOPE, PHYLACTERY.flag) ?? null;
  const { chooseOption } = game.system.azeroth.workflows;
  const feature = actor.items.find(i => i.type === "feature" && i.name === NECRO_FEATURES.lichdom) ?? carried[0];
  const pick = await chooseOption(feature, [
    { key: "keep", available: true, name: t(bound ? "AZEROTH.Lich.Keep" : "AZEROTH.Lich.None"), description: "" },
    ...carried.map(i => ({ key: i.id, available: true, name: t("AZEROTH.Lich.BindTo", { name: i.name }), description: "" }))
  ], null, { prompt: t("AZEROTH.Lich.BindPrompt", { name: actor.name }) });
  if (!pick || pick.key === "keep") return [];
  const item = actor.items.get(pick.key);
  if (!item) return [];
  for (const other of actor.items.filter(i => i.getFlag?.(SCOPE, PHYLACTERY.flag) && i.id !== item.id)) await other.unsetFlag(SCOPE, PHYLACTERY.flag);
  await item.setFlag(SCOPE, PHYLACTERY.flag, { lich: actor.uuid });
  await actor.setFlag(SCOPE, PHYLACTERY.flag, item.uuid);
  return [t("AZEROTH.Lich.Bound", { name: actor.name, item: item.name })];
}

/** The lich's bound phylactery item, where it still exists. */
function phylacteryOf(actor) {
  const uuid = actor?.getFlag?.(SCOPE, PHYLACTERY.flag) ?? null;
  const item = docAt(uuid);
  return item?.documentName === "Item" && item.getFlag?.(SCOPE, PHYLACTERY.flag)?.lich === actor.uuid ? item : null;
}

/**
 * **THE LICH DIES** (the death watch's `died` on a character): with its phylactery existing, a
 * carrier on the dead lich counts 1 day on the world's clock; its end posts the return card.
 */
async function lichDied(actor) {
  if (actor?.type !== "character") return;
  const item = phylacteryOf(actor);
  const counting = [...(actor.effects ?? [])].some(e => e.flags?.[SCOPE]?.[PHYLACTERY.returnFlag]);
  const judged = phylacteryReturnJudgement({ lich: actor.hasFeature?.(NECRO_FEATURES.lichdom) === true, bound: actor.getFlag?.(SCOPE, PHYLACTERY.flag) ?? null, exists: Boolean(item), counting });
  if (!judged.ok) return;
  const start = game.time?.worldTime ?? 0;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: t("AZEROTH.Lich.ReturnName"), img: item.img || "icons/svg/skull.svg", origin: actor.uuid,
    description: `<p>${t("AZEROTH.Lich.ReturnText", { name: actor.name, item: item.name })}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    duration: { value: PHYLACTERY.seconds, units: "seconds", expiry: null }, start: { time: start },
    flags: { [SCOPE]: { [PHYLACTERY.returnFlag]: { item: item.uuid, at: start + PHYLACTERY.seconds } } }
  }]);
}

/**
 * **THE DAY ENDS** (a `deleteActiveEffect` of the return's carrier, on the active GM): where it ran
 * its course - not deleted with the phylactery's destruction - and the phylactery still exists, the
 * GM's card says where the lich returns and offers the return.
 */
async function returnDue(effect, options = {}) {
  const record = effect?.flags?.[SCOPE]?.[PHYLACTERY.returnFlag];
  const lich = effect?.parent;
  if (!record || lich?.documentName !== "Actor" || options?.azerothPhylactery === "destroyed") return;
  if ((game.time?.worldTime ?? 0) + 1 < Number(record.at)) return;
  const item = docAt(record.item);
  if (!item) return;
  const gms = (game.users?.contents ?? []).filter(u => u.isGM).map(u => u.id);
  const where = item.parent?.name ?? game.i18n.localize("AZEROTH.Lich.Nowhere");
  const content = await foundry.applications.handlebars.renderTemplate(OFFER_TEMPLATE, {
    holderUuid: lich.uuid, lich: true, title: NECRO_FEATURES.lichdom,
    text: t("AZEROTH.Lich.ReturnCard", { name: lich.name, item: item.name, where })
  });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: lich }), content, whisper: gms, flags: { [SCOPE]: { kind: NECRO_OFFER_KIND, holder: lich.uuid, offer: "lich" } } });
}

/**
 * **THE LICH RETURNS** (the GM's press on the return card): full Health, the defeated mark gone, and
 * - where its token stands on the viewed scene, placed beside the phylactery by the GM - a feature
 * card recording it in `risen` for the rising cue.
 */
export async function lichReturnFromCard(button) {
  if (!game.user?.isGM) return null;
  const lich = docAt(button?.dataset?.holderUuid);
  if (lich?.documentName !== "Actor") return null;
  const status = CONFIG.specialStatusEffects?.DEFEATED ?? "dead";
  await lich.update({ "system.health.value": lich.system?.health?.max ?? 0 });
  if (lich.statuses?.has?.(status)) await lich.toggleStatusEffect?.(status, { active: false });
  const token = tokenOfActor(lich, canvas?.scene ?? null);
  await postFeatureCard(lich, { key: "lichdom", text: t("AZEROTH.Lich.Returned", { name: lich.name }), risen: token ? [{ sceneId: token.parent.id, tokenIds: [token.id] }] : [] });
  return true;
}

/* ------------------------------------------------------------------ */
/*  The GM's query and the hooks                                        */
/* ------------------------------------------------------------------ */

/** The GM-side horde handler (`HORDE_QUERY`): a collapse the asker could not delete itself. */
export async function hordeQueryHandler({ act = null, ownerUuid = null, actorUuid = null, how = {} } = {}, { user = null } = {}) {
  if (!game.user?.isGM) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  const owner = docAt(ownerUuid);
  if (owner?.documentName !== "Actor" || (user && !owner.testUserPermission(user, "OWNER"))) throw new Error(game.i18n.localize("AZEROTH.Bound.NotOwner"));
  if (act === "collapse") {
    const actor = worldActorOf(docAt(actorUuid));
    if (!actor || bondOf(actor)?.ownerUuid !== owner.uuid) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
    return { collapsed: await collapseNow(owner, actor, { byChoice: how?.byChoice === true, reason: typeof how?.reason === "string" ? how.reason : "dismiss", by: how?.by ?? null }) };
  }
  if (act === "reoffer") {
    // A refused plague rising put back to not offered (MUST-FIX 2), inside the caster's raise chain
    // so it never lands under a raise still in flight; judged here off the corpse as it stands.
    return inOrder(hordeKey(owner.uuid), async () => {
      const token = game.scenes.get(how?.sceneId ?? null)?.tokens?.get(how?.tokenId ?? null) ?? null;
      const mark = token?.getFlag?.(SCOPE, PLAGUE_RISING_TOKEN_FLAG) ?? null;
      const corpse = token?.getFlag?.(SCOPE, CORPSE_FLAG) ?? null;
      // Still this caster's and still open; the raise's own undo may already have put it back.
      if (!token || risingRefusal({ mark, casterUuid: owner.uuid, corpse }) !== null) return { reoffered: false };
      if (risingReoffer({ mark, casterUuid: owner.uuid, corpse })) await token.update({ [`flags.${SCOPE}.${PLAGUE_RISING_TOKEN_FLAG}.offered`]: false });
      return { reoffered: true };
    });
  }
  throw new Error(`horde: no such act ${JSON.stringify(act)}`);
}

/**
 * The horde's hooks: the death watch's listeners (Claim the Fallen, Unending Dead or the collapse,
 * Plague of Undeath, the lich), the phylactery's day and its destruction, and Enslave the Dead's
 * hour handing its creature back. Called once at init.
 */
export async function registerHordeHooks() {
  // 04's Flesh, Bone and Damned (Phase 4c-T): the surges' and the lead's bound sync, Watchful Shades.
  const { registerNecroTalentHooks } = await import("./necromancer-talents.mjs");
  registerNecroTalentHooks();
  const { onDeath } = await import("./death-watch.mjs");
  onDeath(async event => {
    if (event.raisedDown) return onRaisedDown(event.actor);
    if (!event.died) return;
    await offerClaim(event.actor);
    await plagueDied(event.actor);
    await lichDied(event.actor);
  });
  Hooks.on("deleteActiveEffect", (effect, options) => {
    if (!game.users?.activeGM?.isSelf) return;
    if (effect?.flags?.[SCOPE]?.[PHYLACTERY.returnFlag]) returnDue(effect, options).catch(err => console.warn("azeroth-rpg | phylactery", err));
    // The hour run out, or a hand: the creature handed back - sides, ownership and the end's card.
    const enslaved = effect?.flags?.[SCOPE]?.[ENSLAVED_FLAG];
    if (enslaved && !options?.azerothEnslaveEnded) handBack(effect.parent, enslaved).catch(err => console.warn("azeroth-rpg | enslave end", err));
  });
  // **OUT OF A FIGHT, A FALLEN SERVANT WAITS ONLY UNTIL THE CLOCK MOVES** (the 4b review's S11).
  Hooks.on("updateWorldTime", (worldTime, delta) => {
    if (!(Number(delta) > 0) || !game.users?.activeGM?.isSelf) return;
    collapseFallenOnClock().catch(err => console.warn("azeroth-rpg | a fallen servant on the clock", err));
  });
  // **A PHYLACTERY DESTROYED** (*When your phylactery is destroyed, you have none until you make
  // another*): its lich's bond cleared, and a return counting on it deleted, playing no card.
  Hooks.on("deleteItem", item => {
    if (!game.users?.activeGM?.isSelf) return;
    const bond = item?.getFlag?.(SCOPE, PHYLACTERY.flag);
    if (!bond?.lich) return;
    const lich = docAt(bond.lich);
    if (lich?.documentName !== "Actor") return;
    const ids = [...(lich.effects ?? [])].filter(e => e.flags?.[SCOPE]?.[PHYLACTERY.returnFlag]?.item === item.uuid).map(e => e.id);
    (async () => {
      if (ids.length) await lich.deleteEmbeddedDocuments("ActiveEffect", ids, { azerothPhylactery: "destroyed" });
      if (lich.getFlag(SCOPE, PHYLACTERY.flag) === item.uuid) await lich.unsetFlag(SCOPE, PHYLACTERY.flag);
    })().catch(err => console.warn("azeroth-rpg | phylactery destroyed", err));
  });
}
