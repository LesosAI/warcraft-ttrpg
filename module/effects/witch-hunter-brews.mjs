/**
 * **FIELD BREWS, AS DOORS** (02 §7's Field Brews and Decoctions; 08 §12's *Witch hunter's brews*; the Witch Hunter
 * plan's wave 2a-A). The law is `rules/brewing.mjs`, `rules/toxicity.mjs`, `rules/witch-hunter-brews.mjs` and
 * `rules/witch-hunter-standing.mjs`; this module is the ONE writer of a brew:
 *
 * - **The rest opens a brewing** (`witchHunterRest`, from both rests before the card): the window flag keyed by the
 *   rest's generation (the inscription window's shape, `documents/runes.mjs`), the Tome's chance, and the card's lines.
 * - **The Prepare window brews** (`prepareBrews`, the window's `apply`): judged whole first (`brewing.mjs#brewPlan`,
 *   `tome.mjs#studiedRefusal`), then the new brews CREATED FIRST and the spoiled ones DELETED AFTER (D-745: a
 *   duplicate is curable, a loss is not), on whichever actor holds them - through `WH_BREWS_QUERY` on the GM where
 *   this client does not own it, with `gm-writes.mjs#gmAbsentFor` asked first.
 * - **A brew is used** (`useBrew`, routed from `workflows.useGear`): drunk, laid on a weapon or thrown, in D-768's
 *   order - every refusal judged, then the turn's budget, then the dose marked off, then what it does. A drink by a
 *   creature that is not a Witch Hunter is the poison (`toxicity.mjs#nonMakerDrink`, the D-770 tick carrier).
 * - **What the brews acting do** is read off their carriers: Mageroyal draught's refill (`AzerothActor#refillTurn`),
 *   Goldthorn draught and the Ooze Decoction's refused conditions (`CharacterData`), the Boons and overdose on the
 *   roll dialog, Gromsblood draught's retaliation (`actions.mjs#struckBackRows`), Fadeleaf drops' token sight
 *   (`syncFadeleafSight`, on the active GM's client, the way Spectral Sight writes it), and the Spell DC Firebloom
 *   cordial and the medallion add, derived once in `CharacterData` and read here (`whSpellDC`).
 * - **An oil comes off with the fight** (`clearOils`, from `AzerothCombat#_leaveFight`) or after an hour.
 *
 * **PRACTICED HANDS' DOOR** (04, wave 2b): `useBrew({free: true})` spends no Half-Action; the talent's once-a-round
 * count is wave 2b's to judge before it hands `free` in.
 */

import { AZEROTH } from "../config.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { resolveDamage } from "../rules/mitigation.mjs";
import { passedHalf } from "../rules/resisted.mjs";
import { resistKey } from "../rules/records.mjs";
import { areaFor } from "../rules/areas.mjs";
import { dealtHalvedBy } from "../rules/legacy-uses.mjs";
import { spendOne } from "../rules/consumables.mjs";
import { REST_ENDS_FLAG } from "../rules/rest-ends.mjs";
import { REGEN_FLAG } from "./consumable-regen.mjs";
import { acquireConsumableUse } from "./consumable-use-lock.mjs";
import { isUnarmed } from "../rules/unarmed.mjs";
import { EXTRA_MEASURE, FIELD_BREWS, brewPlan, bombThrowRefusal, dosesFor, formulaChoices, FORMULA_KINDS } from "../rules/brewing.mjs";
// 04's Wolf talents, read through the rules' own constants (the inline census of 04's names reads them once wave 2b
// writes their `automated: "inline"` rows; `talent-effects.test.mjs`).
import { SEASONED_BLOOD, REFINED_DECOCTIONS } from "../rules/toxicity.mjs";
import { BREW_IDENTIFIERS, LASTING_BREWS, POTENT_BREWS, SHARPER_OILS, WIDE_BLAST, brewOf, isBrewIdentifier, stampBrew } from "../rules/witch-hunter-brews.mjs";
import { FIELD_NOTES, FOREWARNED, studiedCount, studiedRefusal } from "../rules/tome.mjs";
import {
  BOMB_CARD_FLAG, BREWED_FLAG, BREW_EFFECT_FLAG, BREW_WINDOW_FLAG, FADELEAF_SIGHT_MARK, FORMULAS_FLAG, OIL_FLAG,
  actingBrews, brewStanding, drinkJudgement, elixirsSilverleafEnds, fadeleafActs, fadeleafPatch,
  brewTip, fadeleafWithdrawn, formulasOpen, formulasRefusal, hunterPanel, oilStands, tomeFlagOf, WEAKNESS_CARD_FLAG
} from "../rules/witch-hunter-standing.mjs";
import { isWitchHunter, learnTypeWithDialog, patchTome, startTome, tomeAtRest, tomeOf, typeLabel, weaknessRecordFor } from "./witch-hunter-tome.mjs";

/** The query every write on another client's actor is asked through (`module/queries.mjs`). */
export const WH_BREWS_QUERY = "azeroth-rpg.witchHunterBrews";

/** The pack the brews are copied from. */
const GEAR_PACK = "azeroth-rpg.gear";
/** The feature card a bomb posts (the feature card's own template). */
const FEATURE_CARD = "systems/azeroth-rpg/templates/chat/feature-card.hbs";

const SCOPE = "azeroth-rpg";
const int = v => Math.trunc(Number(v)) || 0;
const values = c => [...(c?.values?.() ?? c ?? [])];
const t = (key, data = {}) => globalThis.game?.i18n?.format?.(key, data) ?? key;
const now = () => Number(globalThis.game?.time?.worldTime) || 0;
const tierOf = actor => Math.min(4, Math.max(1, int(actor?.system?.tier) || 1));
const modOf = (actor, key) => int(actor?.system?.abilities?.[key]?.mod);
const get = uuid => { try { return uuid ? fromUuidSync(uuid) : null; } catch { return null; } };
const ranks = (actor, name) => int(actor?.talentRanks?.(name));

/** Whether this client must ask a GM to write on any of `actors` and none is online (D-774). */
const noGM = actors => gmAbsentFor({ owned: actors.map(a => a?.isOwner === true), isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });

/** A refusal in words: the door ends with nothing paid. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/** The ranks of 04's Wolf talents a brew's numbers take (`stampBrew`'s `ranks`). */
function wolfRanks(actor) {
  return {
    potentBrews: ranks(actor, POTENT_BREWS), sharperOils: ranks(actor, SHARPER_OILS),
    wideBlast: ranks(actor, WIDE_BLAST.name), lastingBrews: ranks(actor, LASTING_BREWS)
  };
}

/** The Toxicity talents (04's Wolf). */
function toxicityRanks(actor) {
  return { seasonedBlood: ranks(actor, SEASONED_BLOOD), refinedDecoctions: ranks(actor, REFINED_DECOCTIONS) };
}

/* ------------------------------------------------------------------ */
/*  The Spell DC and what the brews acting add                          */
/* ------------------------------------------------------------------ */

/**
 * **THE DC A CREATURE RESISTS THIS WITCH HUNTER AGAINST**: the derived `system.spellDC` (the class's Spell DC with the
 * worn medallion's rarity bonus already in it) or, for a Sign, `system.signDC` (Firebloom cordial on top). Both are
 * derived ONCE in `CharacterData.prepareDerivedData` through `medallion.mjs#witchHunterDC` (wave 2c, O-735): this
 * reader adds nothing, so the bombs, the non-maker's poison, the Signs and the sheet read one number. Null where there
 * is no Spell DC.
 *
 * @param {Actor} actor
 * @param {{sign?: boolean}} [o]
 * @returns {number|null}
 */
export function whSpellDC(actor, { sign = false } = {}) {
  if (!actor) return null;
  const sys = actor.system ?? {};
  const dc = sign === true ? (sys.signDC ?? sys.spellDC) : sys.spellDC;
  return Number.isFinite(Number(dc)) && dc !== null ? Math.trunc(Number(dc)) : null;
}

/** What the brews acting on an actor add together (`witch-hunter-brews.mjs#brewEffects`). */
export function actingBrewEffects(actor) {
  return brewStanding(actor?.effects ?? []);
}

/**
 * **GROMSBLOOD DRAUGHT'S ANSWER** (*A creature that hits you with a melee attack takes Physical damage equal to your
 * tier*), in the struck-back row's shape the attack card draws (`actions.mjs#struckBackRows`): marked `melee`, so the
 * roll keeps it for a melee blow alone, landing on the attacker through the card's own `data-self` button.
 *
 * @param {Actor} holder  the creature being struck
 * @param {Actor|null} attacker
 */
export function gromsbloodRows(holder, attacker) {
  if (!holder || !attacker || holder === attacker) return [];
  return brewStanding(holder.effects ?? []).retaliate.filter(r => r.melee).map(r => ({
    name: brewOf(r.source)?.name ?? r.source,
    text: t("AZEROTH.WitchHunter.Gromsblood", { name: holder.name, attacker: attacker.name, n: int(r.amount) }),
    melee: true,
    damage: { amount: int(r.amount) || null, type: r.type ?? "physical" },
    condition: {}
  }));
}

/** Mageroyal draught's Energy at the turn's refill (`AzerothActor#refillTurn`). */
export function brewRefillFor(actor) {
  return actor?.type === "character" ? brewStanding(actor.effects ?? []).refill.energy : 0;
}

/* ------------------------------------------------------------------ */
/*  The rest opens a brewing                                            */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A REST GIVES A WITCH HUNTER** (02's Field Brews: *When you finish a Short or Long Rest, you may brew*; the
 * Tome's learning chance; Studied's pick): the brewing window keyed by the rest's generation, the Tome's turn of the
 * rest (`tomeAtRest`), and the rest card's lines pushed onto `gains`. A character who is no Witch Hunter is left.
 *
 * @param {Actor} actor
 * @param {"short"|"long"} kind
 * @param {{generation?: number, gains?: object[]}} o
 */
export async function witchHunterRest(actor, kind, { generation = 0, gains = [] } = {}) {
  if (!isWitchHunter(actor)) return;
  const tome = await tomeAtRest(actor, kind);
  await actor.setFlag(SCOPE, BREW_WINDOW_FLAG, { generation: int(generation), rest: kind, open: true, defeated: tome.defeated });
  gains.push({ kind: "brewOpen", doses: dosesFor(modOf(actor, "wis"), { extraMeasure: ranks(actor, EXTRA_MEASURE) }) });
  if (tome.learnOpen) gains.push({ kind: "tomeLearnOpen" });
}

/** The brewing window as it stands now: open, for this rest's generation. */
export function brewWindow(actor) {
  const w = actor?.getFlag?.(SCOPE, BREW_WINDOW_FLAG) ?? null;
  const generation = int(actor?.getFlag?.(SCOPE, "restGeneration"));
  return w?.open === true && int(w.generation) === generation ? w : null;
}

/* ------------------------------------------------------------------ */
/*  The formulas known                                                  */
/* ------------------------------------------------------------------ */

/** The formulas a Witch Hunter knows, by identifier. */
export function formulasOf(actor) {
  const raw = actor?.getFlag?.(SCOPE, FORMULAS_FLAG);
  return BREW_IDENTIFIERS.filter(id => Array.isArray(raw) && raw.includes(id) && brewOf(id).kind !== "decoction");
}

/**
 * **LEARN FORMULAS** (02's Field Brews: *You know four elixirs ..., and two more each time you reach a new tier. You
 * also know one oil and one bomb of your choice from the same list, and one more oil and one more bomb each time you
 * reach a new tier*; the lead's Phase 0 answer: *"Field Brews should also teach 1 oil and 1 bomb of the players
 * choosing. 1 more for each tier"*; O-727, wave 2c). The Hunter panel's **Learn formulas** and the first Field Brews
 * Use after a tier rises open it: one chooser for each kind with any left to pick, listing the WHOLE of 08's table for
 * that kind, the formulas already known greyed and said *Known*, the ticks capped at the count the tier still gives
 * (`witch-hunter-standing.mjs#formulasOpen`). Refused in words where nothing is left to learn; the whole set judged
 * (`brewing.mjs#knownRefusal`) before the ONE write, so a pick past the tier's count is refused and nothing is written.
 * `picks` hands the choice in (a batch, a macro, the Quench batch).
 *
 * @param {Actor} actor
 * @param {{picks?: string[]|null}} [o]
 * @returns {Promise<string[]|null>}  the formulas known after, or null where nothing was written
 */
export async function chooseFormulas(actor, { picks = null } = {}) {
  if (!isWitchHunter(actor)) return null;
  const known = formulasOf(actor);
  const tier = tierOf(actor);
  const open = formulasOpen({ formulas: known, tier });
  let chosen = [...known];
  if (Array.isArray(picks)) chosen = [...new Set([...known, ...picks])];
  else {
    if (!Object.values(open).some(n => n > 0)) return refuse("AZEROTH.WitchHunter.Formulas.Refuse.none", { name: actor.name });
    const feature = actor.items.find(i => i.type === "feature" && i.name === FIELD_BREWS) ?? actor.items.find(i => i.type === "class");
    for (const kind of FORMULA_KINDS) {
      if (!open[kind]) continue;
      const options = formulaChoices()[kind].map(id => {
        const isKnown = known.includes(id);
        return { key: id, name: brewOf(id).name, available: !isKnown, description: isKnown ? `<p>${t("AZEROTH.WitchHunter.Formulas.Known")}</p>` : "" };
      });
      const learnable = options.filter(o => o.available).length;
      if (!learnable) continue;
      const answer = await game.system.azeroth.workflows.chooseOption(feature, options, null,
        { label: "AZEROTH.WitchHunter.Formulas.Learn", prompt: t(`AZEROTH.WitchHunter.Formulas.Prompt.${kind}`, { n: open[kind] }), max: Math.min(open[kind], learnable) });
      if (!answer) return null;
      chosen.push(...(Array.isArray(answer) ? answer : [answer]).filter(a => a?.available !== false).map(a => a?.key).filter(Boolean));
    }
  }
  const refusal = formulasRefusal({ formulas: chosen, tier });
  if (refusal) return refuse(`AZEROTH.WitchHunter.Formulas.Refuse.${refusal.code}`, { kind: refusal.kind ?? "", name: refusal.identifier ?? "" });
  const ordered = BREW_IDENTIFIERS.filter(id => chosen.includes(id));
  const added = ordered.filter(id => !known.includes(id));
  if (!added.length) return ordered;
  await actor.setFlag(SCOPE, FORMULAS_FLAG, ordered);
  ui.notifications?.info(t("AZEROTH.WitchHunter.Formulas.Learned", { name: actor.name, names: added.map(id => brewOf(id).name).join(", ") }));
  return ordered;
}

/* ------------------------------------------------------------------ */
/*  The Prepare window's door                                           */
/* ------------------------------------------------------------------ */

/** Every brew this Witch Hunter brewed, on any actor in the world, as `{actor, item}` (04's Second Brewing reads it too). */
export function brewsMadeBy(maker) {
  const out = [];
  const seen = new Set();
  const visit = actor => {
    if (!actor || seen.has(actor.uuid)) return;
    seen.add(actor.uuid);
    for (const item of values(actor.items)) {
      if (!isBrewIdentifier(item)) continue;
      const by = item.flags?.[SCOPE]?.[BREWED_FLAG]?.maker ?? null;
      // A brew with no maker on the Witch Hunter's own sheet is theirs too (one dropped from the pack by a GM).
      if (by === maker.uuid || (!by && actor === maker)) out.push({ actor, item });
    }
  };
  visit(maker);
  for (const actor of values(game.actors)) visit(actor);
  return out.sort((a, b) => String(a.item.id).localeCompare(String(b.item.id)));
}

/** The brew documents in the gear pack, by identifier. */
async function brewSources(identifiers) {
  const pack = game.packs.get(GEAR_PACK);
  if (!pack) return new Map();
  const index = await pack.getIndex({ fields: ["system.identifier"] });
  const ids = index.filter(e => identifiers.includes(e.system?.identifier)).map(e => e._id);
  const docs = ids.length ? await pack.getDocuments({ _id__in: ids }) : [];
  return new Map(docs.map(d => [d.system?.identifier, d]));
}

/**
 * **EVERY BREW'S DESCRIPTION, BY IDENTIFIER** (the Prepare window's tooltips): off the gear pack's index, read once.
 * The Prepare window draws it for the brews it offers, where the actor holds no item to read it off.
 *
 * @returns {Promise<Map<string, string>>}  identifier -> the description's HTML
 */
let brewDescriptions = null;
export async function brewDescriptionsByIdentifier() {
  if (brewDescriptions) return brewDescriptions;
  const pack = game.packs.get(GEAR_PACK);
  if (!pack) return new Map();
  const index = await pack.getIndex({ fields: ["system.identifier", "system.description"] });
  brewDescriptions = new Map(index.filter(e => isBrewIdentifier(e.system?.identifier)).map(e => [e.system.identifier, e.system.description ?? ""]));
  return brewDescriptions;
}

/**
 * **THE PREPARE WINDOW, JUDGED WHOLE** (D-768): the brewing window open for this rest, the plan legal
 * (`brewing.mjs#brewPlan`: formulas known, doses, the Decoction's gate, Hunter's oil's type) and the Studied pick legal
 * (`tome.mjs#studiedRefusal`). Answers the refusal's lang key or the plan.
 *
 * @param {Actor} actor
 * @param {{picks?: Record<string, number>, studied?: string[], oilType?: string|null, decoctionType?: string|null, school?: string|null}} state
 */
export function prepareJudgement(actor, { picks = {}, studied = [], oilType = null, decoctionType = null, school = null } = {}) {
  if (!isWitchHunter(actor)) return { refusal: "AZEROTH.WitchHunter.Prepare.Refuse.notHunter" };
  const window = brewWindow(actor);
  if (!window) return { refusal: "AZEROTH.WitchHunter.Prepare.Refuse.closed" };
  const tome = tomeOf(actor);
  if (!tome.started) return { refusal: "AZEROTH.WitchHunter.Prepare.Refuse.noTome" };
  const decoctionHeld = actor.items.some(i => i.type === "feature" && i.name === "Decoctions");
  const defeated = [...new Set([...(window.defeated ?? []), ...tome.defeated])];
  const held = brewsMadeBy(actor).map(({ actor: a, item }) => ({ id: `${a.uuid}|${item.id}`, identifier: item.system.identifier }));
  const plan = brewPlan({
    picks, known: formulasOf(actor), doses: dosesFor(modOf(actor, "wis"), { extraMeasure: ranks(actor, EXTRA_MEASURE) }),
    tome: tome.known, defeated, decoctionHeld, decoctionType, oilType, held
  });
  if (plan.refusal) return { refusal: `AZEROTH.WitchHunter.Prepare.Refuse.${plan.refusal.code}`, plan, reason: plan.refusal.reason ?? null };
  if (plan.make.some(m => m.identifier === "decoction")) {
    const row = brewOf("decoction").byType?.[decoctionType] ?? null;
    if (row?.chooseWard && !row.chooseWard.schools.includes(school)) return { refusal: "AZEROTH.WitchHunter.Prepare.Refuse.school", plan };
  }
  // 04's Forewarned and the carried First Tome's The Margins (*may choose 1 more*; D-2162) each add one.
  const count = studiedCount(modOf(actor, "wis"), ranks(actor, FOREWARNED) + (Number(actor.system?.signatureEffects?.studiedTypes) || 0));
  const why = studiedRefusal({ picks: studied, known: tome.known, count });
  if (why) return { refusal: `AZEROTH.WitchHunter.Prepare.Refuse.studied.${why}`, plan };
  return { refusal: null, plan, studied, window };
}

/**
 * **BREW** (the Prepare window's `apply`): judged whole first, then the new brews CREATED, then the spoiled ones
 * DELETED (D-745), then the Studied types and the window closed. A spoiled brew another client's actor holds is
 * deleted on the GM's client (`WH_BREWS_QUERY`), and with no GM online the whole brewing is refused up front.
 *
 * @param {Actor} actor
 * @param {object} state  the window's `{picks, studied, oilType, decoctionType, school}`
 * @returns {Promise<{ok: boolean, made: string[], spoiled: number}|null>}
 */
export async function prepareBrews(actor, state = {}) {
  const judged = prepareJudgement(actor, state);
  if (judged.refusal) return refuse(judged.refusal, { name: actor?.name ?? "", reason: judged.reason ?? "" });
  const spoilTargets = judged.plan.spoil.map(key => {
    const [uuid, itemId] = String(key).split("|");
    const holder = uuid === actor.uuid ? actor : get(uuid);
    return holder ? { holder, itemId } : null;
  }).filter(Boolean);
  if (noGM([actor, ...spoilTargets.map(s => s.holder)])) return refuse("AZEROTH.WitchHunter.NoGM", { name: actor.name });
  // 1. The new brews, made FIRST.
  const sources = await brewSources(judged.plan.make.map(m => m.identifier));
  const generation = int(actor.getFlag(SCOPE, "restGeneration"));
  const spellDC = whSpellDC(actor);
  const data = [];
  for (const m of judged.plan.make) {
    const doc = sources.get(m.identifier);
    if (!doc) return refuse("AZEROTH.WitchHunter.Prepare.Refuse.pack", { name: brewOf(m.identifier)?.name ?? m.identifier });
    const raw = doc.toObject();
    delete raw._id;
    delete raw.folder;
    delete raw.sort;
    raw.system.quantity = m.doses;
    raw.system.container = null;
    raw.flags = { ...(raw.flags ?? {}), [SCOPE]: { ...(raw.flags?.[SCOPE] ?? {}), [BREWED_FLAG]: {
      maker: actor.uuid, generation, brewed: m.doses, type: m.type ?? null,
      school: m.identifier === "decoction" ? (state.school ?? null) : null, spellDC, tier: tierOf(actor)
    } } };
    if (m.identifier === "hunters-oil" && m.type) raw.name = t("AZEROTH.WitchHunter.HuntersOilNamed", { name: raw.name, type: typeLabel(m.type) });
    if (m.identifier === "decoction" && m.type) raw.name = t("AZEROTH.WitchHunter.DecoctionNamed", { name: raw.name, type: typeLabel(m.type) });
    data.push(raw);
  }
  const made = data.length ? await actor.createEmbeddedDocuments("Item", data) : [];
  if (made.length !== data.length) return refuse("AZEROTH.WitchHunter.Prepare.Refuse.unconfirmed", { name: actor.name });
  // **WHAT THIS BREWING MADE, ON RECORD** (04's Second Brewing: *each elixir and Decoction you brewed ... at your last
  // rest returns to the number of doses you brewed*; wave 2b): a dose drunk to the last deletes its item, so the
  // brewing keeps its own list (`rules/witch-hunter-talents.mjs#brewLogOf`).
  {
    const { WH_BREW_LOG_FLAG, brewLogOf } = await import("../rules/witch-hunter-talents.mjs");
    const names = Object.fromEntries(made.map(i => [i.system?.identifier, i.name]));
    await actor.setFlag(SCOPE, WH_BREW_LOG_FLAG, brewLogOf(generation, judged.plan.make, { school: state.school ?? null, names }));
  }
  // 2. The spoiled ones, DELETED AFTER, by whoever may write on each holder.
  let spoiled = 0;
  const madeIds = new Set(made.map(i => i.id));
  const byHolder = new Map();
  for (const { holder, itemId } of spoilTargets) {
    if (holder === actor && madeIds.has(itemId)) continue;
    if (!byHolder.has(holder)) byHolder.set(holder, []);
    byHolder.get(holder).push(itemId);
  }
  for (const [holder, ids] of byHolder) {
    const live = ids.filter(id => holder.items.has(id));
    if (!live.length) continue;
    if (holder.isOwner) {
      await holder.deleteEmbeddedDocuments("Item", live);
      spoiled += live.length;
    } else {
      const done = await game.users.activeGM.query(WH_BREWS_QUERY, { op: "spoil", makerUuid: actor.uuid, holderUuid: holder.uuid, itemIds: live }, { timeout: 15000 }).catch(() => null);
      spoiled += int(done?.spoiled);
    }
  }
  // 3. Studied, and the window closed by the same brewing.
  // Studied alone is SET, merged onto the Tome as it stands when the write's turn comes (`patchTome`; the final review).
  await patchTome(actor, { set: { studied: judged.studied } });
  await actor.setFlag(SCOPE, BREW_WINDOW_FLAG, { ...judged.window, open: false });
  const names = made.map(i => `${i.name} ×${i.system?.quantity ?? 1}`);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: cardHtml(t("AZEROTH.WitchHunter.Prepare.Title"), [
      t("AZEROTH.WitchHunter.Prepare.Made", { name: actor.name, brews: names.join(", ") || t("AZEROTH.WitchHunter.Prepare.Nothing") }),
      spoiled ? t("AZEROTH.WitchHunter.Prepare.Spoiled", { n: spoiled }) : null,
      judged.studied.length ? t("AZEROTH.WitchHunter.Prepare.Studied", { types: judged.studied.map(typeLabel).join(", ") }) : null
    ]),
    flags: { [SCOPE]: { kind: "whPrepare" } }
  });
  return { ok: true, made: made.map(i => i.id), spoiled };
}

/**
 * **THE FIRST BREWING, AT CREATION** (the lead, 2026-11-27: *"Field Brews chosen at character creation should have doses
 * available at start"*): the creator's Finish opens the brewing window as a Long Rest would (this restGeneration) and the
 * Prepare window with it, so a new Witch Hunter splits its doses among the formulas it just chose before the first fight
 * instead of waiting for a rest. Nothing is brewed for the player: the split is theirs, and the Hunter panel's Prepare
 * reopens the window until they brew or rest.
 *
 * @param {Actor} actor
 * @returns {Promise<object|null>}
 */
export async function firstBrewing(actor) {
  if (!isWitchHunter(actor)) return null;
  const generation = int(actor.getFlag(SCOPE, "restGeneration"));
  await actor.setFlag(SCOPE, BREW_WINDOW_FLAG, { generation, rest: "long", open: true, defeated: [] });
  return openPrepare(actor);
}

/** Open the Prepare window for an actor (`applications/brew-prepare.mjs`). */
export async function openPrepare(actor) {
  if (!isWitchHunter(actor)) return null;
  if (!brewWindow(actor)) return refuse("AZEROTH.WitchHunter.Prepare.Refuse.closed", { name: actor.name });
  if (!tomeOf(actor).started) return refuse("AZEROTH.WitchHunter.Prepare.Refuse.noTome", { name: actor.name });
  const { AzerothBrewPrepare } = await import("../applications/brew-prepare.mjs");
  return new AzerothBrewPrepare({ actor }).render({ force: true });
}

/**
 * **A FIELD BREWS OR TOME USE** (`useFeature`'s one early branch, `onUse.whBrew`): Prepare, or the Tome's learning
 * Test. Nothing is paid; each door judges for itself.
 *
 * @param {{actor: Actor, item: Item, onUse: {whBrew: "prepare"|"learn"}}} o
 */
export async function whBrewUse({ actor, onUse } = {}) {
  if (onUse?.whBrew === "learn") return learnTypeWithDialog(actor);
  if (!tomeOf(actor).started) return startTome(actor);
  if (!formulasOf(actor).length) return chooseFormulas(actor);
  // **A PICK WHEN THE TIER RISES** (02's Field Brews: *two more each time you reach a new tier*; O-727, wave 2c): the
  // first Field Brews Use with formulas still open asks for them, then goes on to Prepare whatever the answer.
  if (Object.values(formulasOpen({ formulas: formulasOf(actor), tier: tierOf(actor) })).some(n => n > 0)) await chooseFormulas(actor);
  return openPrepare(actor);
}

/* ------------------------------------------------------------------ */
/*  Using a brew                                                        */
/* ------------------------------------------------------------------ */

/** A small feature-styled card, every line escaped. */
function cardHtml(title, lines = []) {
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const body = lines.filter(Boolean).map(l => `<p class="azeroth-card-line azeroth-fired"><em>${esc(l)}</em></p>`).join("");
  return `<div class="azeroth azeroth-card azeroth-card-feature"><header class="azeroth-card-header"><h3>${esc(title)}</h3></header><div class="azeroth-card-body">${body}</div></div>`;
}

/** The weapons an oil may coat: every weapon the user holds, never the bare hand or the claws. */
function oilTargets(actor) {
  return values(actor?.items).filter(i => i.type === "weapon" && !isUnarmed(i))
    .sort((a, b) => Number(b.system?.equipped === true) - Number(a.system?.equipped === true) || a.name.localeCompare(b.name));
}

/**
 * **THE FIRST CREATURE A BOMB CANNOT REACH** (08 §12: *thrown at a point within 30 feet*; O-728, wave 2c): each creature
 * named measured from the thrower's token on that creature's scene, footprint to footprint (`canvas/footprints.mjs
 * #feetApart`, the one measuring place, D-732), judged by `brewing.mjs#bombThrowRefusal` against the stamp's range and
 * radius (Wide Blast's feet in both). A creature with no token, or a thrower with none on its scene, is not measured
 * and never refused. Answers `{name, feet, reach}` or null.
 */
async function bombOutOfReach(actor, targets = [], bomb = {}) {
  const list = [...(targets ?? [])];
  if (!list.length) return null;
  const { casterTokenOn, targetTokenDoc } = await import("../canvas/range.mjs");
  const { feetApart } = await import("../canvas/footprints.mjs");
  const feet = list.map(tg => {
    const doc = targetTokenDoc(tg);
    const own = doc ? casterTokenOn(actor, doc.parent, { target: doc }) : null;
    return doc && own ? feetApart(own, doc) : null;
  });
  const far = bombThrowRefusal({ feet, range: bomb?.range ?? 30, radius: bomb?.radius ?? 10 });
  return far ? { name: list[far.index]?.name ?? "", feet: Math.round(far.feet), reach: far.reach } : null;
}

/**
 * **USE A BREW** (08 §12: *Using a brew is a Half-Action*), routed from `workflows.useGear`. Every refusal is judged
 * first and said in words with nothing spent: the dose left, the Decoction limit, an oil with no weapon to coat. Then
 * the turn's budget (none where `free`: 04's Practiced Hands, wave 2b), then the dose marked off, then what it does.
 *
 * **ONE BREW AT A TIME, AND TOXICITY JUDGED AGAIN BEFORE THE BUDGET** (the plan: *Toxicity is judged before the budget
 * and re-checked after the receipt*, `useGear`'s shape; wave 2c): the actor's consumable-use lock
 * (`consumable-use-lock.mjs`, the one `useGear` holds) is taken before anything is judged and held until the brew has
 * landed, so a second press cannot judge the Toxicity a first drink is about to change; and the drink is judged again
 * off the effects as they stand immediately before the turn's budget (step 1b), so a drink another client landed
 * while a chooser stood open is counted, and a Decoction past the limit refuses in words with nothing spent.
 *
 * @param {{actor: Actor, item: Item, targets?: object[], free?: boolean}} o
 * @returns {Promise<ChatMessage|null>}
 */
export async function useBrew({ actor, item, targets = [], free = false } = {}) {
  if (!actor || !item || !isBrewIdentifier(item)) return null;
  const release = acquireConsumableUse(actor);
  if (!release) return refuse("AZEROTH.Use.Busy");
  try {
    return await useBrewHeld({ actor, item, targets, free });
  } finally {
    release();
  }
}

/** The brew's door, inside the actor's consumable-use lock (`useBrew`). */
async function useBrewHeld({ actor, item, targets = [], free = false } = {}) {
  const identifier = item.system.identifier;
  const row = brewOf(identifier);
  const brewed = item.flags?.[SCOPE]?.[BREWED_FLAG] ?? {};
  const maker = get(brewed.maker) ?? (isWitchHunter(actor) ? actor : null);
  const held = item.system?.quantity === undefined ? 1 : item.system.quantity;
  if (held !== null && held <= 0) return refuse("AZEROTH.Use.NoneLeft", { name: item.name });
  // **THE MAKER'S SPELL DC AND TIER, AT THE USE** (the plan's door note: *Bombs stamp the maker's Spell DC and tier
  // damage at the throw, as Deft Hands does*): read off the maker now, and off what the brewing recorded only where the
  // maker is gone from the world.
  const scope = { tier: maker ? tierOf(maker) : (int(brewed.tier) || tierOf(actor)), con: modOf(actor, "con"), wis: modOf(actor, "wis"), int: modOf(actor, "int"),
    spellDC: (maker ? whSpellDC(maker) : null) ?? brewed.spellDC ?? null, type: brewed.type ?? null, school: brewed.school ?? null, ranks: wolfRanks(maker ?? actor) };
  const stamped = stampBrew(identifier, scope);
  // 1. Judged whole.
  let drink = null;
  let onto = null;
  if (row.kind === "elixir" || row.kind === "decoction") {
    drink = drinkJudgement({ identifier, witchHunter: isWitchHunter(actor), effects: actor.effects ?? [], conMod: modOf(actor, "con"),
      ...toxicityRanks(actor), makerDC: scope.spellDC });
    if (drink.refusal) return refuse(`AZEROTH.WitchHunter.Use.Refuse.${drink.refusal}`, { name: actor.name });
  } else if (row.kind === "oil") {
    const weapons = oilTargets(actor);
    if (!weapons.length) return refuse("AZEROTH.WitchHunter.Use.Refuse.noWeapon", { name: actor.name });
    if (weapons.length === 1) onto = weapons[0];
    else {
      const pick = await game.system.azeroth.workflows.chooseOption(item, weapons.map(w => ({ key: w.id, name: w.name, description: "" })), null,
        { prompt: t("AZEROTH.WitchHunter.Use.OilPrompt", { name: item.name }) });
      onto = pick ? actor.items.get(pick.key) ?? null : null;
      if (!onto) return null;
    }
  } else if (row.kind === "bomb") {
    // *Thrown at a point within 30 feet* (Wide Blast's feet already in the stamp): every creature named measured from
    // the thrower's token, before the budget; nothing measured is nothing refused (O-728, wave 2c).
    const far = await bombOutOfReach(actor, targets, stamped.bomb);
    if (far) return refuse("AZEROTH.WitchHunter.Bomb.OutOfReach", { name: item.name, target: far.name, feet: far.feet, reach: far.reach });
  }
  if (drink?.nonMaker && noGM([actor])) return refuse("AZEROTH.WitchHunter.NoGM", { name: actor.name });
  // 1b. Toxicity judged again off the effects as they stand now, after every chooser and before the budget: the count
  // the card's overdose line reads is this one, and a Decoction a concurrent drink took the limit with is refused here.
  if (drink) {
    drink = drinkJudgement({ identifier, witchHunter: isWitchHunter(actor), effects: actor.effects ?? [], conMod: modOf(actor, "con"),
      ...toxicityRanks(actor), makerDC: scope.spellDC });
    if (drink.refusal) return refuse(`AZEROTH.WitchHunter.Use.Refuse.${drink.refusal}`, { name: actor.name });
  }
  // 1b'. **THE DOSE AND THE BLADE, STILL THERE, BEFORE ANYTHING IS PAID** (D-768; the architect review's A4, wave 2d-A,
  // D-2137): the brew still on the actor as it was judged, and an oil's weapon still on it, asked after every chooser and
  // before the free use's mark and the budget, so a dose used up or a weapon dropped while a chooser stood open refuses
  // in words with nothing spent.
  if (actor.items.get(item.id) !== item) return refuse("AZEROTH.Use.Changed");
  if (onto && actor.items.get(onto.id) !== onto) return refuse("AZEROTH.Use.Changed");
  // 1c. 04's Practiced Hands and Cluster Bomb (wave 2b): *Once a round per rank, you may use an elixir or an oil ... as
  // a free action*, *after you throw a bomb ... you may throw another as a free action* - the round's mark claimed
  // through the combatant's queued door BEFORE the budget (`effects/witch-hunter-talents.mjs#freeBrewFor`).
  let freeBy = null;
  if (!free && isWitchHunter(actor)) {
    const { freeBrewFor } = await import("./witch-hunter-talents.mjs");
    freeBy = await freeBrewFor({ actor, row });
    if (freeBy) free = true;
  }
  // 2. The turn's budget.
  if (!(await game.system.azeroth.workflows.spendTurnBudget(actor, free ? null : "half"))) return null;
  // 3. The dose, marked off before anything lands (`consumables.mjs#spendOne`, the one rule). Judged in step 1b'; the
  // consumable-use lock holds every brew door on this client, so only another client deleting the brew in the budget's
  // own round trip reaches this last guard.
  if (actor.items.get(item.id) !== item || (onto && actor.items.get(onto.id) !== onto)) return refuse("AZEROTH.Use.Changed");
  const spend = spendOne(held);
  if (spend?.delete) await item.delete();
  else if (spend) await item.update({ "system.quantity": spend.quantity });
  const left = spend === null ? null : (spend.delete ? 0 : spend.quantity);
  const lines = [];
  if (free) lines.push(t("AZEROTH.Use.FreeApply"));
  if (freeBy) lines.push(t("AZEROTH.WhTalent.FreeBrew", { talent: freeBy }));
  // The bomb thrown this turn, on the round's record: Cluster Bomb's *after you throw a bomb* (wave 2b).
  if (row.kind === "bomb" && isWitchHunter(actor)) {
    const { markBombThrown } = await import("./witch-hunter-talents.mjs");
    await markBombThrown(actor);
  }
  // 4. What it does.
  if (row.kind === "bomb") return throwBomb({ actor, maker: maker ?? actor, item, stamped, targets, lines, left, freeUse: free });
  if (row.kind === "oil") {
    const prior = onto.getFlag(SCOPE, OIL_FLAG);
    // Unset FIRST, deliberately: `setFlag` is an update and MERGES an object into the stored one, so a lone write would
    // keep the prior oil's `coating` keys the new oil lacks (Blindweed's `onHit.bane`, or another oil's `pierce`, riding
    // the next oil). The final architect review's finding 5 asked for one write; it is not the same write.
    if (prior) await onto.unsetFlag(SCOPE, OIL_FLAG);
    await onto.setFlag(SCOPE, OIL_FLAG, { identifier, name: item.name, coating: stamped.coating, at: now(), by: (maker ?? actor).uuid });
    lines.push(t("AZEROTH.Use.LaidOn", { name: item.name, item: onto.name }));
    if (prior && brewOf(prior.identifier)) lines.push(t("AZEROTH.WitchHunter.Use.OilReplaced", { name: prior.name ?? "" }));
  } else if (drink?.nonMaker) {
    lines.push(...(await poisonedDrink({ actor, item, maker, nonMaker: drink.nonMaker })));
  } else {
    lines.push(...(await drinkBrew({ actor, item, stamped, maker: maker ?? actor })));
    if (drink?.preview?.rises) lines.push(t("AZEROTH.WitchHunter.Use.Overdose", { n: drink.preview.after.overdose, penalty: drink.preview.after.penalty }));
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: cardHtml(item.name, [...lines, left === null ? null : t("AZEROTH.WitchHunter.Use.Left", { n: left })]),
    flags: { [SCOPE]: { kind: "whBrewUse", identifier } }
  });
}

/**
 * **A WITCH HUNTER DRINKS** (08 §12's elixirs and 02's Decoction): what lands at once (Peacebloom draught's Health,
 * Goldthorn draught's and Silverleaf tonic's endings) and one carrier for whatever lasts, carrying the stamped brew
 * (`BREW_EFFECT_FLAG`) the readers count: the Active Effect changes in the `final` phase (Kingsblood draught, the
 * Decoction's), Liferoot tonic's regen beat (`consumable-regen.mjs`), and the span - a minute (Lasting Brews), an
 * hour (Fadeleaf drops), until the next Long Rest (the Decoction, `REST_ENDS_FLAG`). Silverleaf tonic lays none: it
 * does not count and lasts no time. Answers the card's lines.
 */
async function drinkBrew({ actor, item, stamped, maker }) {
  const lines = [];
  const use = stamped.use;
  if (use.heal?.health) {
    const before = actor.system?.health?.value ?? 0;
    await actor.applyHealing(use.heal.health, { from: actor, consumable: true });
    lines.push(t("AZEROTH.Use.Health", { n: Math.max(0, (actor.system?.health?.value ?? before) - before) }));
  }
  // *It ends every elixir acting on you* (Silverleaf tonic), before its own endings.
  if (stamped.effects.endsElixirs) {
    const ids = elixirsSilverleafEnds(actor.effects ?? []);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    lines.push(t("AZEROTH.WitchHunter.Use.ElixirsEnded", { n: ids.length }));
  }
  // *It ends **Poisoned** on you* (Goldthorn), *and **Poisoned** and **Diseased*** (Silverleaf): every effect holding
  // the condition, a carrier of an affliction included (`useGear`'s Restorative Potion's way).
  for (const id of use.ends ?? []) {
    const label = game.i18n.localize(AZEROTH.conditions[id] ?? id);
    const holding = values(actor.effects).filter(e => [...(e.statuses ?? [])].includes(id)).map(e => e.id);
    if (holding.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", holding);
      lines.push(t("AZEROTH.Use.Ended", { condition: label }));
    } else lines.push(t("AZEROTH.Use.NotHeld", { condition: label }));
  }
  const duration = use.duration ?? null;
  if (!duration) return lines;
  const benefit = stamped.decoction?.benefit ?? null;
  const changes = [...(use.changes ?? []), ...(benefit?.changes ?? [])].map(c => ({ key: c.key, type: c.type ?? "add", value: String(c.value ?? ""), phase: c.phase ?? "final" }));
  const restSpan = duration.units === "longRest" ? "long" : null;
  const timing = restSpan ? {} : ((await import("./durations.mjs")).spellTiming(actor, { value: duration.value, units: duration.units }) ?? {});
  const data = {
    name: item.name, img: item.img, origin: maker?.uuid ?? actor.uuid, disabled: false,
    description: "",
    ...timing,
    system: { changes },
    flags: { [SCOPE]: {
      consumable: item.system.identifier,
      [BREW_EFFECT_FLAG]: { ...stamped, name: item.name, maker: maker?.uuid ?? null },
      ...(restSpan ? { [REST_ENDS_FLAG]: restSpan } : {}),
      ...(use.regen?.health ? { [REGEN_FLAG]: { health: use.regen.health, mana: 0, source: item.name } } : {})
    } }
  };
  // One carrier a brew: a second drink of the same brew replaces the first's (its span starts again).
  const prior = values(actor.effects).filter(e => e.flags?.[SCOPE]?.[BREW_EFFECT_FLAG]?.identifier === item.system.identifier).map(e => e.id);
  if (prior.length) await actor.deleteEmbeddedDocuments("ActiveEffect", prior);
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  lines.push(t("AZEROTH.Use.Lasts", { name: item.name }));
  if (use.regen?.health) lines.push(t("AZEROTH.Use.Regen", { name: item.name, health: use.regen.health, mana: 0 }));
  if (stamped.effects.refill?.amount) lines.push(t("AZEROTH.WitchHunter.Use.Refill", { n: stamped.effects.refill.amount }));
  return lines;
}

/**
 * **A DRINKER WHO IS NOT A WITCH HUNTER** (02's Field Brews: *gains none of its effect. It makes a Body Resilience Test
 * against your Spell DC, and on a failure it takes 10 Nature damage at the start of each of its turns for 3 turns*;
 * F7): the Test rolled now, against the MAKER's DC, and a failure lays the tick carrier (D-770). Answers the lines.
 */
async function poisonedDrink({ actor, item, maker, nonMaker }) {
  const lines = [t("AZEROTH.WitchHunter.Use.NoEffect", { name: actor.name, brew: item.name })];
  const message = await game.system.azeroth.workflows.rollResilience({ actor, resilience: nonMaker.test.resilience, dc: nonMaker.test.dc, title: item.name });
  const passed = message?.rolls?.[0]?.outcome?.success === true || message?.flags?.[SCOPE]?.success === true;
  if (passed) {
    lines.push(t("AZEROTH.WitchHunter.Use.PoisonResisted", { name: actor.name }));
    return lines;
  }
  const { layTickOn } = await import("./ticks.mjs");
  const tick = { ...nonMaker.onFail.tick, name: item.name, source: maker?.uuid ?? null };
  // **A COUNTED TICK IS LAID WHERE SOMETHING ENDS IT** (`rules/ticks.mjs#tickHasClock`): in a started fight the
  // carrier counts its turns down; out of one it is spanned to the world's clock (`durations.mjs#roundsOrClock`).
  const { roundsOrClock } = await import("./durations.mjs");
  const inFight = actor.activeFight?.()?.started === true;
  const laid = await layTickOn(actor, { tick, img: item.img, origin: maker?.uuid ?? null, timing: inFight ? {} : (roundsOrClock(actor, tick.rounds) ?? {}) });
  lines.push(laid
    ? t("AZEROTH.WitchHunter.Use.Poisoned", { name: actor.name, n: nonMaker.onFail.tick.amount, rounds: nonMaker.onFail.tick.rounds })
    : t("AZEROTH.WitchHunter.Use.PoisonNotLaid", { name: actor.name }));
  return lines;
}

/**
 * **A BOMB THROWN** (08 §12: *thrown at a point within 30 feet. Each creature in a 10 ft radius centered on that point
 * makes a Reflex Resilience Test against your Spell DC*; Wide Blast's reach and radius): ONE feature card, the
 * creature ability card's shape, so the Resist rows, the half on a pass, nothing on a pass, the conditions a failure
 * lands and the Place area are the doors that already exist. The maker's Spell DC and the tier damage were stamped at
 * the brewing (Deft Hands' way); each target's damage is met by its own Armor Points and Ward now; the weakness Bane
 * rides the card's record (`WEAKNESS_CARD_FLAG`); Silver dust's failure is the card's `BOMB_CARD_FLAG`.
 */
async function throwBomb({ actor, maker, item, stamped, targets = [], lines = [], left = null, freeUse = false }) {
  const lst = [...(targets ?? [])];
  const use = stamped.use;
  const bomb = stamped.bomb;
  const resist = { key: use.resist.resilience, label: AZEROTH.resiliences[use.resist.resilience], dc: use.resist.dc };
  const halfOnPass = bomb.half === true && Boolean(use.damage);
  const noneOnPass = !halfOnPass && Boolean(use.damage);
  let damage = null;
  let damageByTarget = lst.map(() => null);
  let passedByTarget = [];
  let damagePassed = null;
  if (use.damage?.amount) {
    const type = use.damage.type;
    // 04's Drawn Across on the thrower (the Legacy branches' door 25): the damage it deals halved, read off the source
    // as every damage door reads it.
    const halvedBomb = dealtHalvedBy(actor);
    const mitigate = (tg, passed = false) => resolveDamage({
      rating: use.damage.amount, sl: 0, kind: type === "physical" ? "physical" : "magical", school: type,
      fireTakenBonus: tg?.fireTakenBonus ?? 0, apByLocation: tg?.apByLocation ?? {}, ward: tg?.wardBySchool?.[type] ?? 0,
      schoolArmor: tg?.schoolArmor?.[type] ?? 0, immune: tg?.immune ?? [], vulnerable: tg?.vulnerable ?? [], slAddsToDamage: false,
      dealtHalved: halvedBomb,
      passedHalf: passed
    });
    damageByTarget = lst.map(tg => mitigate(tg));
    if (halfOnPass) {
      passedByTarget = lst.map(tg => mitigate(tg, true));
      damagePassed = passedHalf(use.damage.amount);
    }
    const first = damageByTarget[0] ?? mitigate(null);
    damage = {
      final: first.damage,
      explanation: [t("AZEROTH.WitchHunter.Bomb.Damage", { n: use.damage.amount, type: game.i18n.localize(AZEROTH.damageTypes[type] ?? type) }),
        noneOnPass ? game.i18n.localize("AZEROTH.Card.DamageOnFail") : null].filter(Boolean).join(" · ")
    };
  }
  const onFail = bomb.onFail ?? {};
  const inflicts = onFail.condition ? [{
    condition: onFail.condition,
    label: game.i18n.localize(AZEROTH.conditions[onFail.condition] ?? onFail.condition),
    value: onFail.value ?? null,
    until: onFail.until ? "targetTurnEnd" : null,
    untilLabel: onFail.until ? t("AZEROTH.WitchHunter.Bomb.UntilTheirTurn") : null,
    onFail: true
  }] : [];
  const onFailInflicts = inflicts.map(i => ({ condition: i.condition, value: i.value, until: i.until }));
  const resistRows = lst.map((tg, index) => ({
    index, name: tg?.name ?? "", actorUuid: (tg?.actorUuid ?? ""), key: resistKey(tg),
    resilience: resist.key, label: resist.label, dc: resist.dc
  }));
  if (onFail.noHealing || onFail.loseImmune) lines.push(t("AZEROTH.WitchHunter.Bomb.SilverDust"));
  if (!lst.length) lines.push(t("AZEROTH.WitchHunter.Bomb.NoTargets"));
  // The blast in the one area grammar (`rules/areas.mjs#areaFor`), so the card's Place area draws it (Wide Blast's
  // radius stamped above).
  const area = areaFor(use.area ?? "");
  const weakness = weaknessRecordFor(maker, { bomb: stamped.identifier });
  const bombSource = (await import("../applications/roll-dialog.mjs")).sourceOf(actor);
  const { renderTemplate } = foundry.applications.handlebars;
  const content = await renderTemplate(FEATURE_CARD, {
    config: AZEROTH, title: item.name, subtitle: actor.name, action: freeUse ? null : "half", cost: null,
    uses: left === null ? null : { value: left, max: left + 1 }, rolled: false, heal: null, speakerName: actor.name,
    damage, resist, resistRows, area, attack: false, inflicts,
    effect: null, note: [t("AZEROTH.WitchHunter.Bomb.Reach", { range: bomb.range, radius: bomb.radius }), ...lines].filter(Boolean).join(" · "),
    targets: lst.map((tg, i) => ({ ...tg, index: i })), provenance: []
  });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [SCOPE]: {
      kind: "feature", itemId: null, title: item.name, targets: lst,
      // **WHO THREW IT, WHICH BREW, AND THAT NO CASTING TEST WAS MADE** (D-724; the animation records' census): the
      // thrower's token, the key the brew is filed under, and no cast.
      source: bombSource ?? null,
      featureKey: `brew:${stamped.identifier}`,
      casting: false,
      damageByTarget, heal: null, sl: 0, area, notAttack: true,
      ...(damage && halfOnPass ? { halfOnPass: true, passedByTarget, damagePassed } : {}),
      ...(damage && noneOnPass ? { noneOnPass: true } : {}),
      ...(onFailInflicts.length ? { onFailInflicts } : {}),
      ...(weakness ? { [WEAKNESS_CARD_FLAG]: weakness } : {}),
      [BOMB_CARD_FLAG]: { identifier: stamped.identifier, maker: maker?.uuid ?? null, onFail: { noHealing: onFail.noHealing === true, loseImmune: [...(onFail.loseImmune ?? [])] } }
    } }
  });
}

/**
 * **A BOMB'S FAILURE BEYOND ITS CONDITIONS** (Silver dust: *On a failure, until the end of its next turn, a creature
 * regains no Health and loses **Immune (Physical)***), from the Resist door (`dice/chat.mjs`) on the client that rolled
 * the creature's Test, which owns it: the no-healing mark (`effects/no-healing.mjs`) and the strip
 * (`rules/laid-immune.mjs#REMAINS_FLAG`), both to the end of its next turn. Answers the lines.
 *
 * @param {{message: ChatMessage, actor: Actor, passed: boolean, maker?: Actor|null}} o
 */
export async function bombResisted({ message, actor, passed } = {}) {
  const bomb = message?.flags?.[SCOPE]?.[BOMB_CARD_FLAG] ?? null;
  if (!bomb || passed || !actor) return [];
  const lines = [];
  const name = brewOf(bomb.identifier)?.name ?? "";
  const maker = get(bomb.maker);
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  if (bomb.onFail?.noHealing) {
    const { layNoHealing } = await import("./no-healing.mjs");
    const mark = await layNoHealing({ victim: actor, striker: maker, source: name, name: actor.name, span: "victim" });
    if (mark?.landed) lines.push(t("AZEROTH.WitchHunter.Bomb.NoHealing", { name: actor.name }));
  }
  if ((bomb.onFail?.loseImmune ?? []).length && actor.isOwner) {
    const { REMAINS_FLAG } = await import("../rules/laid-immune.mjs");
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name, img: "icons/svg/downgrade.svg", origin: maker?.uuid ?? null, disabled: false,
      ...(untilEndOfNextTurnOrRound(actor) ?? {}),
      flags: { [SCOPE]: { [REMAINS_FLAG]: { loseImmune: [...bomb.onFail.loseImmune], source: name } } }
    }]);
    lines.push(t("AZEROTH.WitchHunter.Bomb.LosesImmune", { name: actor.name }));
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/* ------------------------------------------------------------------ */
/*  Oils off with the fight                                             */
/* ------------------------------------------------------------------ */

/** Every oil on an actor's weapons taken off (*until the fight ends*), and any an hour has passed on. */
export async function clearOils(actor) {
  if (!actor?.isOwner) return 0;
  const coated = values(actor.items).filter(i => i.type === "weapon" && i.getFlag?.(SCOPE, OIL_FLAG));
  for (const w of coated) await w.unsetFlag(SCOPE, OIL_FLAG);
  return coated.length;
}

/** The oil on a weapon if it still stands, else null (an hour passed). */
export function oilOn(weapon) {
  const oil = weapon?.getFlag?.(SCOPE, OIL_FLAG) ?? null;
  return oilStands(oil, { now: now() }) ? oil : null;
}

/* ------------------------------------------------------------------ */
/*  Fadeleaf drops' sight (O-720)                                       */
/* ------------------------------------------------------------------ */

/**
 * **FADELEAF DROPS' DARKNESS SIGHT, WRITTEN ON THE TOKENS** (*For 1 hour, you see in darkness within 60 feet*; the
 * lead's P2): while the drops act, every token of the drinker sees as darkvision to 60 feet; when they end, a token the
 * drops wrote goes back to a character's own sight. On the active GM's client, as Spectral Sight's sync is
 * (`effects/demon-hunter-features.mjs#syncSpectralSight`): a world actor writes its prototype and every token of it,
 * a synthetic actor its own token. Answers the writes made.
 *
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function syncFadeleafSight(actor) {
  if (!actor || actor.type !== "character") return 0;
  if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return 0;
  const acts = fadeleafActs(actor.effects ?? []);
  const docs = [];
  if (actor.isToken && actor.token) docs.push({ doc: actor.token, prefix: "" });
  else {
    docs.push({ doc: actor, prefix: "prototypeToken." });
    for (const scene of values(game.scenes)) for (const token of values(scene.tokens)) if (token.actorId === actor.id && token.actorLink) docs.push({ doc: token, prefix: "" });
  }
  let written = 0;
  for (const { doc, prefix } of docs) {
    const source = doc.documentName === "Actor" ? (doc.prototypeToken?.toObject?.() ?? {}) : (doc.toObject?.() ?? {});
    let step = null;
    if (acts) {
      const patch = fadeleafPatch();
      const changes = {};
      for (const [key, value] of Object.entries(patch)) {
        const heldValue = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), source);
        if (JSON.stringify(heldValue ?? null) !== JSON.stringify(value)) changes[key] = value;
      }
      step = Object.keys(changes).length ? changes : null;
    } else {
      const back = fadeleafWithdrawn(source);
      if (back) step = { ...back, [`flags.${SCOPE}.${FADELEAF_SIGHT_MARK}`]: new foundry.data.operators.ForcedDeletion() };
    }
    if (!step) continue;
    await doc.update(prefix ? Object.fromEntries(Object.entries(step).map(([k, v]) => [`${prefix}${k}`, v])) : step);
    written++;
  }
  return written;
}

/* ------------------------------------------------------------------ */
/*  The Hunter panel's model                                            */
/* ------------------------------------------------------------------ */

/**
 * **WHAT THE HUNTER PANEL DRAWS FOR AN ACTOR** (`witch-hunter-standing.mjs#hunterPanel`), read off the actor's items,
 * effects and flags. Null for a character who is no Witch Hunter.
 *
 * @param {Actor} actor
 */
export function hunterPanelFor(actor) {
  if (actor?.type !== "character") return null;
  const brews = values(actor.items).filter(i => isBrewIdentifier(i))
    .map(i => ({ id: i.id, identifier: i.system.identifier, name: i.name, img: i.img, quantity: i.system?.quantity ?? 1, tip: brewTip(i.system?.description) }));
  // **A BREW IN ANYONE'S HANDS** (O-723; P5's reading: *oils and bombs work in anyone's hands*): a brew takes no bag
  // slot, so the Gear tab draws none, and a character who is no Witch Hunter is drawn the brew list alone, with Use.
  if (!isWitchHunter(actor)) {
    if (!brews.length) return null;
    const order = id => BREW_IDENTIFIERS.indexOf(id);
    return {
      brewsOnly: true,
      brews: brews.sort((a, b) => order(a.identifier) - order(b.identifier) || String(a.id).localeCompare(String(b.id)))
        .map(b => ({ ...b, kind: brewOf(b.identifier).kind, kindLabel: game.i18n.localize(`AZEROTH.WitchHunter.Kind.${brewOf(b.identifier).kind}`) }))
    };
  }
  const panel = hunterPanel({
    brews, effects: actor.effects ?? [], conMod: modOf(actor, "con"), wisMod: modOf(actor, "wis"), tier: tierOf(actor),
    tome: tomeFlagOf(actor), formulas: formulasOf(actor), window: brewWindow(actor),
    ...toxicityRanks(actor), extraMeasure: ranks(actor, EXTRA_MEASURE), fieldNotes: ranks(actor, FIELD_NOTES)
  });
  return {
    ...panel,
    brews: panel.brews.map(b => ({ ...b, kindLabel: game.i18n.localize(`AZEROTH.WitchHunter.Kind.${b.kind}`) })),
    knownLabels: panel.known.map(typeLabel),
    studiedLabels: panel.studied.map(typeLabel),
    formulaNames: panel.formulas.map(id => brewOf(id)?.name ?? id),
    formulasLeft: Object.values(panel.formulasOpen).reduce((n, v) => n + v, 0),
    // **THE SPELL DC THE PANEL PRINTS** (wave 2c, O-735): the one derived number (`whSpellDC`), the medallion in it,
    // and the Signs' with Firebloom cordial - the same two a Sign, a bomb and the non-maker's drink are resisted at.
    dc: dcView(actor)
  };
}

/**
 * The panel's two DCs and their words: `spell` (bombs, the non-maker's drink) and `sign` (with Firebloom cordial),
 * both read through `whSpellDC`, never added here.
 */
export function dcView(actor) {
  const spell = whSpellDC(actor);
  const sign = whSpellDC(actor, { sign: true });
  return {
    spell, sign,
    spellLabel: spell === null ? "" : t("AZEROTH.WitchHunter.Panel.SpellDC", { dc: spell }),
    signLabel: sign === null ? "" : t("AZEROTH.WitchHunter.Panel.SignDC", { dc: sign })
  };
}

/* ------------------------------------------------------------------ */
/*  The GM's handler and the hooks                                      */
/* ------------------------------------------------------------------ */

/**
 * **WHAT A CLIENT ASKS THE GM TO WRITE** (`WH_BREWS_QUERY`), judged again here: a spoiled brew deleted off a holder
 * this client does not own, only where the item IS a brew the asker's own Witch Hunter brewed.
 */
export async function witchHunterBrewsQueryHandler(payload = {}, { user = null } = {}) {
  if (!game.user?.isGM) return { ok: false };
  if (payload?.op !== "spoil") return { ok: false };
  const maker = payload.makerUuid ? await fromUuid(payload.makerUuid) : null;
  const holder = payload.holderUuid ? await fromUuid(payload.holderUuid) : null;
  if (!maker || !holder || !isWitchHunter(maker)) return { ok: false };
  if (user && !maker.testUserPermission(user, "OWNER") && !user.isGM) return { ok: false };
  const ids = (Array.isArray(payload.itemIds) ? payload.itemIds : []).filter(id => {
    const item = holder.items.get(id);
    return item && isBrewIdentifier(item) && item.flags?.[SCOPE]?.[BREWED_FLAG]?.maker === maker.uuid;
  });
  if (ids.length) await holder.deleteEmbeddedDocuments("Item", ids);
  return { ok: true, spoiled: ids.length };
}

/** Whether an effect is a Fadeleaf drops carrier. */
const fadeleafEffect = effect => effect?.flags?.[SCOPE]?.[BREW_EFFECT_FLAG]?.identifier === "fadeleaf-drops";

/** Register the brews' hooks once at init: Fadeleaf drops' sight as its carrier comes and goes, and at every canvas. */
export function registerWitchHunterBrews() {
  const resync = effect => {
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor" || !fadeleafEffect(effect)) return;
    syncFadeleafSight(actor).catch(err => console.warn("azeroth-rpg | Fadeleaf drops' sight", err));
  };
  Hooks.on("createActiveEffect", resync);
  Hooks.on("deleteActiveEffect", resync);
  Hooks.on("updateActiveEffect", resync);
  Hooks.on("canvasReady", () => {
    if (!game.user?.isGM || game.users?.activeGM?.id !== game.user.id) return;
    for (const actor of values(game.actors)) {
      if (actor.type !== "character") continue;
      const marked = actor.prototypeToken?.flags?.[SCOPE]?.[FADELEAF_SIGHT_MARK] !== undefined;
      if (marked || fadeleafActs(actor.effects ?? [])) syncFadeleafSight(actor).catch(err => console.warn("azeroth-rpg | Fadeleaf drops' sight", err));
    }
  });
}

