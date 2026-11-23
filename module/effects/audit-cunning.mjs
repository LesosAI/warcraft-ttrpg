/**
 * **THE CLASS TALENT AUDIT'S ROGUE, PRIEST AND SHAMAN DOORS** (D-1880 to D-1887).
 *
 * The writes the pure law in `rules/class-talents.mjs` and `rules/audit-cunning.mjs` asks
 * for, each called by `dice/workflows.mjs#useFeature` or `AzerothCombat#_turnTicks`:
 *
 * - a minute's state laid on the user (04's Master of Shadows, Miracle and Herald of the
 *   Void): `layMinuteState`, one effect a flag, replacing the last;
 * - 02's Ward on many creatures (04's Spirit Shell, 02's Divine Hymn): `wardMany`, through
 *   the Ward's one door (`effects/wards.mjs#layWard`);
 * - at the start of the shaman's turn, Eye of the Storm's strike and Static Charge, and
 *   Tide of the Ancestors' heal (`shamanTurnStart`);
 * - Herald of the Void's spread off a sustained Shadow tick (`heraldSpreadAfterTicks`), whose card's
 *   Apply is its own door (`heraldApply`): one other creature within 10 feet of the one struck, once.
 *
 * Every write here is made AFTER the Use judged and paid (D-768's order).
 */

import { AZEROTH } from "../config.mjs";
import { HERALD_FLAG, MIRACLE_FLAG, SHADOWS_FLAG, CHARGE_FLAG, chargeFor, wardAmount, wardOptionsFor, wardSchools } from "../rules/class-talents.mjs";
import { EYE_OF_THE_STORM, HERALD_OF_THE_VOID, TIDE_OF_THE_ANCESTORS, eyeStrikeAmount, eyeStrikeRefusal, heraldCardAmount, heraldSpread, heraldStrikeRefusal, isTideBond, tideConditionOptions, tideHealAmount, tidePick } from "../rules/audit-cunning.mjs";
import { bondOf, boundOf } from "../documents/bound.mjs";
import { minuteSpan, untilNextTurnOrRound } from "./durations.mjs";
import { layWard } from "./wards.mjs";

/** The flags a minute's state may stand under, and what each says (`AZEROTH.Audit.*`). */
const STATE_WORDS = Object.freeze({
  [SHADOWS_FLAG]: "AZEROTH.Audit.Shadows",
  [MIRACLE_FLAG]: "AZEROTH.Audit.Miracle",
  [HERALD_FLAG]: "AZEROTH.Audit.Herald"
});

/**
 * Whether a minute's state stands on this creature.
 *
 * @param {Actor} actor
 * @param {string} flag
 */
export function minuteStanding(actor, flag) {
  return (actor?.effects ?? []).some(e => e.active !== false && e.flags?.["azeroth-rpg"]?.[flag]);
}

/**
 * **A MINUTE'S STATE ON THE USER** (Master of Shadows, Miracle, Herald of the Void): one
 * effect under the flag, the last one replaced, spanning a minute of the fight's rounds or
 * of the world's clock (`durations.mjs#minuteSpan`). The card's line in words.
 *
 * @param {Actor} actor
 * @param {{flag: string, name: string, img?: string|null, minutes?: number, data?: object}} o
 * @returns {Promise<string>}
 */
export async function layMinuteState(actor, { flag, name, img = null, minutes = 1, data = {} } = {}) {
  const stale = (actor.effects ?? []).filter(e => e.flags?.["azeroth-rpg"]?.[flag]).map(e => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
  const words = STATE_WORDS[flag] ?? "AZEROTH.Audit.Minute";
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: img ?? "icons/svg/aura.svg", origin: actor.uuid,
    description: `<p>${game.i18n.format(words, { name: actor.name, minutes })}</p>`,
    ...(minuteSpan(actor, minutes) ?? {}),
    flags: { "azeroth-rpg": { [flag]: { source: name, ...data } } }
  }]);
  return game.i18n.format(words, { name: actor.name, minutes });
}

/**
 * **02's WARD ON MANY CREATURES**: 04's Spirit Shell (*Every friendly target within 20 feet
 * of you gains your Ward class feature against a school you name*) lays 02's Ward with
 * every talent the Ward's patch carries, until the priest's next turn; 02's Divine Hymn
 * (*gains Ward 3 of that school for 10 minutes*) lays a plain Ward 3 for ten minutes,
 * which no Ward talent touches (`hymn`).
 *
 * @param {Actor} priest
 * @param {{targets: Array<{actor: Actor, name: string}>, school: string, hymn?: {ward: number, minutes: number}|null,
 *   img?: string|null, description?: string}} o
 * @returns {Promise<string[]>}  the card's lines
 */
export async function wardMany(priest, { targets = [], school, hymn = null, img = null, description = "" } = {}) {
  const lines = [];
  const tier = priest.system?.tier ?? 1;
  const opts = hymn ? null : wardOptionsFor(priest.takenTalents?.() ?? [], { tier });
  const schools = hymn ? [school] : wardSchools({ chosen: school, everySchool: opts.everySchool, schools: Object.keys(AZEROTH.schools ?? {}) });
  const amount = hymn ? hymn.ward : wardAmount(tier);
  const ward = hymn
    ? { schools, amount, reduction: 0, undispellable: false, absorb: 0, atone: 0, hymn: true }
    : { schools, amount, reduction: opts.reduction, undispellable: opts.undispellable, absorb: opts.absorb, atone: opts.atone,
      undispellableBy: (opts.by?.undispellable ?? []).join(", ") };
  const span = hymn ? minuteSpan(priest, hymn.minutes) : untilNextTurnOrRound(priest);
  for (const t of targets) {
    const done = await layWard({ priest, target: t.actor, name: t.name ?? "", span, img, description, ward });
    lines.push(game.i18n.format(done.landed ? "AZEROTH.Ward.Laid" : "AZEROTH.Ward.NotLaid", { name: done.name || t.name || "", n: amount }));
  }
  return lines;
}

/**
 * **AT THE START OF THE SHAMAN'S TURN** (04's Eye of the Storm and Tide of the Ancestors;
 * the class talent audit's B7 and B8, D-1886, D-1887), on the active GM's client, after
 * the turn's upkeep:
 *
 * - **Eye of the Storm** while its Sustain stands: a Static Charge, to no more than the
 *   shaman may hold, and a card carrying the strike - the Nature damage of the tier plus 2 -
 *   whose Apply lands it on the creature the shaman's player picks (the card is the
 *   player's, so its Apply is theirs; *one creature of your choice within 60 feet*).
 * - **Tide of the Ancestors** while its totem stands: every friendly target within 30 feet
 *   of the totem regains the tier, through the one healing door; *one condition on one of
 *   them ends* is the shaman's choice, and the card names who holds what.
 *
 * @param {Actor} actor  the shaman whose turn it is
 * @returns {Promise<string[]>}  lines for the turn's own card
 */
export async function shamanTurnStart(actor) {
  if (actor?.type !== "character") return [];
  const lines = [];
  const sustaining = actor.getFlag?.("azeroth-rpg", "sustaining") ?? [];
  if (sustaining.some(e => e?.identifier === EYE_OF_THE_STORM.identifier)) lines.push(...await eyeOfTheStormTurn(actor));
  lines.push(...await tideTurn(actor));
  return lines;
}

/** The card's user, by the roll dialog's own rule (D-724), for the animation layer's record. */
async function userSourceOf(actor) {
  try {
    return (await import("../applications/roll-dialog.mjs")).sourceOf(actor) ?? null;
  } catch {
    return null;
  }
}

/** The owning player a card should be authored by, else the GM running it. */
function authorFor(actor) {
  const player = (game.users ?? []).find(u => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER"));
  return player ?? game.user;
}

async function eyeOfTheStormTurn(actor) {
  const lines = [];
  const talents = actor.takenTalents?.() ?? [];
  // The Static Charge, to no more than the shaman may hold (04's Static Charge's rank).
  const charge = chargeFor(talents);
  const held = Math.max(0, Math.trunc(Number(actor.getFlag("azeroth-rpg", CHARGE_FLAG))) || 0);
  if (charge && held < charge.max) {
    await actor.setFlag("azeroth-rpg", CHARGE_FLAG, held + 1);
    lines.push(game.i18n.format("AZEROTH.Audit.EyeCharge", { name: actor.name, n: held + 1 }));
  } else lines.push(game.i18n.format(charge ? "AZEROTH.Audit.EyeChargeFull" : "AZEROTH.Audit.EyeNoCharge", { name: actor.name }));
  const amount = eyeStrikeAmount(actor.system?.tier ?? 1);
  const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs", {
    config: AZEROTH, title: game.i18n.localize("AZEROTH.Audit.EyeName"), subtitle: actor.name,
    action: null, cost: null, uses: null, rolled: false, heal: null, speakerName: actor.name,
    damage: { final: amount, explanation: game.i18n.format("AZEROTH.Audit.EyeExplain", { n: amount, feet: EYE_OF_THE_STORM.feet }) },
    resist: null, resistRows: [], area: null, attack: false, inflicts: [],
    effect: `<p>${game.i18n.format("AZEROTH.Audit.EyeStrike", { name: actor.name, n: amount, feet: EYE_OF_THE_STORM.feet })}</p>`,
    note: null, targets: [], provenance: []
  });
  const eyeSource = await userSourceOf(actor);
  await ChatMessage.create({
    author: authorFor(actor).id,
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { "azeroth-rpg": {
      kind: "feature", featureName: game.i18n.localize("AZEROTH.Audit.EyeName"), identifier: EYE_OF_THE_STORM.identifier,
      damageType: EYE_OF_THE_STORM.damageType, notAttack: true, targets: [],
      source: eyeSource ?? null,
      featureKey: EYE_OF_THE_STORM.identifier,
      casting: false
    } }
  });
  return lines;
}

/** The Tide totem bound to this shaman, or null. */
export function tideTotemOf(actor) {
  return boundOf(actor, "totem").find(t => isTideBond(bondOf(t))) ?? null;
}

async function tideTurn(actor) {
  const totem = tideTotemOf(actor);
  if (!totem) return [];
  // An encounter totem's token is its own unlinked copy (`plantTotem`), so `getActiveTokens(true)` never
  // finds it: every token of the totem on the viewed scene, and that token's own Health (the live pass).
  const token = totem.getActiveTokens?.(false)?.[0] ?? null;
  if (!token || (token.actor?.system?.health?.value ?? totem.system?.health?.value ?? 0) <= 0) return [];
  const { creaturesWithin } = await import("../canvas/engaged.mjs");
  const near = creaturesWithin(actor, TIDE_OF_THE_ANCESTORS.feet, { from: token, who: "ally" })
    .filter(r => r.actor && r.actor.uuid !== totem.uuid && r.actor !== token.actor && r.token?.id !== token.id);
  const amount = tideHealAmount(actor.system?.tier ?? 1);
  const lines = [];
  for (const r of near) {
    await r.actor.applyHealing?.(amount, { from: actor, givenBy: actor });
    lines.push(game.i18n.format("AZEROTH.Audit.TideHealed", { name: r.token.name ?? r.actor.name, n: amount }));
  }
  // **ONE CONDITION ON ONE OF THEM ENDS** (the wave 2 review): asked of the shaman's player, or the GM
  // where none is online, and ended through the one cure door. Not awaited: a turn's start never
  // waits on a chooser, and the choice posts its own line.
  const { curableConditionsOn } = await import("./legacy-uses.mjs");
  const rows = near.map(r => ({ uuid: r.actor.uuid, name: r.token.name ?? r.actor.name, conditions: curableConditionsOn(r.actor) }));
  const options = tideConditionOptions(rows, id => game.i18n.localize(AZEROTH.conditions?.[id] ?? id));
  if (options.length) {
    lines.push(game.i18n.localize("AZEROTH.Audit.TideAsked"));
    tideEndCondition(actor, near, options).catch(err => console.warn("azeroth-rpg | Tide of the Ancestors' condition", err));
  }
  return lines;
}

/** The query the shaman's player answers Tide of the Ancestors' chooser through. */
export const TIDE_QUERY = "azeroth-rpg.tideChoose";

/** The shaman's Tide of the Ancestors feature, the chooser's item. */
const tideFeatureOf = actor => (actor?.items ?? []).find(i => i.type === "feature" && i.name === TIDE_OF_THE_ANCESTORS.totem) ?? null;

/**
 * Ask whoever answers for the shaman which condition ends, then end it through the cure door
 * (`effects/legacy-uses.mjs#cureCondition`), said on a card. Runs on the active GM's client.
 */
export async function tideEndCondition(actor, near, options) {
  const feature = tideFeatureOf(actor);
  if (!feature) return null;
  const player = (game.users ?? []).find(u => u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")) ?? null;
  let key = null;
  if (player) {
    try {
      key = (await player.query(TIDE_QUERY, { shamanUuid: actor.uuid, options }, { timeout: 120000 }))?.key ?? null;
    } catch (err) {
      console.warn("azeroth-rpg | Tide of the Ancestors' chooser", err);
    }
  } else {
    const { chooseOption } = await import("../dice/workflows.mjs");
    key = (await chooseOption(feature, options, null, { prompt: game.i18n.format("AZEROTH.Audit.TidePrompt", { name: actor.name }) }))?.key ?? null;
  }
  const pick = tidePick(key, options);
  const target = pick ? (near.find(r => r.actor.uuid === pick.uuid)?.actor ?? null) : null;
  const { cureCondition } = await import("./legacy-uses.mjs");
  const done = target ? await cureCondition({ target, id: pick.id, by: actor, item: feature }) : null;
  const line = done?.ended
    ? game.i18n.format("AZEROTH.Audit.TideEnded", { name: done.name, condition: game.i18n.localize(AZEROTH.conditions?.[pick.id] ?? pick.id) })
    : game.i18n.format("AZEROTH.Audit.TideNoneEnded", { name: actor.name });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p class="azeroth-drain">${line}</p>`, flags: { "azeroth-rpg": { kind: "tick" } } });
  return done;
}

/**
 * The player-side handler (`TIDE_QUERY`): only a GM may ask, the shaman must be the player's, and the
 * answer is one of the options asked - judged again by `tidePick` on the GM's client.
 */
export async function tideChooseHandler({ shamanUuid = null, options = [] } = {}, { user = null } = {}) {
  if (user && !user.isGM) throw new Error(game.i18n.localize("AZEROTH.Card.NotYours"));
  const actor = shamanUuid ? await fromUuid(shamanUuid) : null;
  const feature = tideFeatureOf(actor);
  if (!feature || !actor.isOwner) return { key: null };
  const clean = (Array.isArray(options) ? options : []).filter(o => typeof o?.key === "string").map(o => ({ key: o.key, name: String(o.name ?? ""), description: "" }));
  const { chooseOption } = await import("../dice/workflows.mjs");
  const picked = await chooseOption(feature, clean, null, { prompt: game.i18n.format("AZEROTH.Audit.TidePrompt", { name: actor.name }) });
  return { key: picked?.key ?? null };
}

/**
 * **04's HERALD OF THE VOID'S SPREAD** (*when a Shadow spell you Sustain deals damage at the
 * start of a creature's turn, one other creature of your choice within 10 feet of it takes the
 * same damage*; B7, D-1885), on the active GM's client after the creature's ticks landed: for
 * each caster whose Shadow tick stands on this creature, whose herald's minute stands and who
 * sustains the spell, a card carrying the damage the beat dealt, whose Apply lands it on the
 * creature the caster names (the card is the caster's player's). Whom it reaches is the
 * caster's choice; the 10 feet is said on the card.
 *
 * @param {Actor} actor   the creature whose turn it is
 * @param {number} before its Health before the ticks
 * @returns {Promise<string[]>}
 */
export async function heraldSpreadAfterTicks(actor, before = 0) {
  const dealt = Math.max(0, (Number(before) || 0) - (Number(actor?.system?.health?.value) || 0));
  if (!dealt) return [];
  const lines = [];
  const seen = new Set();
  for (const effect of actor.effects ?? []) {
    const tick = effect.active === false ? null : (effect.flags?.["azeroth-rpg"]?.tick ?? null);
    if (!tick?.source || tick.kind !== "damage" || seen.has(tick.source)) continue;
    let caster = null;
    try { caster = fromUuidSync(tick.source); } catch { caster = null; }
    if (caster?.documentName !== "Actor") continue;
    const sustained = (caster.getFlag?.("azeroth-rpg", "sustaining") ?? []).some(e => e && (e.uuid === tick.castUuid || (tick.cast && e.cast === tick.cast)));
    const amount = heraldSpread({ standing: minuteStanding(caster, HERALD_FLAG), sustained, type: tick.type ?? null, dealt });
    if (!amount) continue;
    seen.add(tick.source);
    const name = game.i18n.localize("AZEROTH.Audit.HeraldName");
    const content = await foundry.applications.handlebars.renderTemplate("systems/azeroth-rpg/templates/chat/feature-card.hbs", {
      config: AZEROTH, title: name, subtitle: caster.name, action: null, cost: null, uses: null, rolled: false, heal: null,
      speakerName: caster.name, damage: { final: amount, explanation: String(amount) }, resist: null, resistRows: [], area: null,
      attack: false, inflicts: [], note: null, targets: [], provenance: [],
      effect: `<p>${game.i18n.format("AZEROTH.Audit.HeraldSpread", { caster: caster.name, name: actor.name, n: amount, feet: HERALD_OF_THE_VOID.feet })}</p>`
    });
    const heraldSource = await userSourceOf(caster);
    // **WHAT THE SPREAD'S APPLY JUDGES, RECORDED ON THE CARD** (the class talent audit's final review): the
    // creature the tick struck and its scene - the 10 feet are measured from it, and it is never the one
    // struck again - and the damage the beat dealt, read back off the card and never off a request.
    const struckScene = actor.token?.parent?.id ?? globalThis.canvas?.scene?.id ?? null;
    await ChatMessage.create({
      author: authorFor(caster).id, speaker: ChatMessage.getSpeaker({ actor: caster }), content,
      flags: { "azeroth-rpg": {
        kind: "feature", featureName: name, identifier: HERALD_OF_THE_VOID.identifier, damageType: HERALD_OF_THE_VOID.school, notAttack: true, targets: [],
        source: heraldSource ?? null,
        featureKey: HERALD_OF_THE_VOID.identifier,
        casting: false,
        heraldFrom: { uuid: actor.uuid, sceneId: struckScene }, heraldAmount: amount
      } }
    });
    lines.push(game.i18n.format("AZEROTH.Audit.HeraldSpread", { caster: caster.name, name: actor.name, n: amount, feet: HERALD_OF_THE_VOID.feet }));
  }
  return lines;
}

/* -------------------------------------------- */
/*  Eye of the Storm's strike, applied once      */
/* -------------------------------------------- */

/** The query the strike is written through where this client may not write the creature or the card. */
export const EYE_QUERY = "azeroth-rpg.eyeStrike";

/** The strike's words for a refusal tail (`eyeStrikeRefusal`). */
const EYE_REFUSALS = Object.freeze({
  one: "AZEROTH.Audit.EyeRefuse.one", far: "AZEROTH.Audit.EyeRefuse.far", struck: "AZEROTH.Audit.EyeRefuse.struck",
  unmeasured: "AZEROTH.Audit.EyeRefuse.unmeasured"
});

/**
 * The creature a card speaks for, its token DOCUMENT on the card's own scene (else the viewed one), and
 * that scene: read off the scene's data, so a GM viewing another scene judges the distance too (the class
 * talent audit's final review).
 */
function eyeShamanOf(message) {
  const sp = message?.speaker ?? {};
  const scene = (sp.scene ? game.scenes?.get(sp.scene) : null) ?? globalThis.canvas?.scene ?? null;
  const token = sp.token ? (scene?.tokens?.get(sp.token) ?? null) : null;
  const actor = token?.actor ?? (sp.actor ? game.actors?.get(sp.actor) : null) ?? null;
  return { actor, token, scene };
}

/**
 * Judge the strike against one creature and land it: within 60 feet of the shaman, measured off the
 * scene's token documents and refused where it cannot be (fail closed), the card not yet struck, claimed
 * on the card before the damage. Answers `{ok, reason}`.
 */
async function eyeStrikeHere(message, target) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (flags.identifier !== EYE_OF_THE_STORM.identifier) return { ok: false, reason: "one" };
  const { actor: shaman, token: from, scene } = eyeShamanOf(message);
  const { feetBetweenActors, tokenDocOn } = await import("../canvas/engaged.mjs");
  const { feetApart } = await import("../canvas/footprints.mjs");
  const there = tokenDocOn(target, scene);
  const feet = target && from && there ? feetApart(from, there) : (target && shaman ? feetBetweenActors(shaman, target, scene) : null);
  const refused = eyeStrikeRefusal({ named: target ? 1 : 0, feet, struck: flags.eyeStruck === true, measured: true });
  if (refused) return { ok: false, reason: refused };
  await message.update({ "flags.azeroth-rpg.eyeStruck": true });
  const amount = eyeStrikeAmount(shaman?.system?.tier ?? 1);
  // Nature damage is magical (05 §15): the target's Nature Ward, Immune and Vulnerable meet it, no
  // Armor Points, and the shaman's own halving rides inside the record, so Icebound Fortitude and the
  // damage door's other readers see the blow's inputs (D-979, the B3 review's census).
  const { resolveRecordedDamage } = await import("../rules/damage-record.mjs");
  const { wardBySchool } = await import("../rules/ward.mjs");
  const { dealtHalvedBy } = await import("../rules/legacy-uses.mjs");
  const s = target.system ?? {};
  const school = EYE_OF_THE_STORM.damageType;
  const result = resolveRecordedDamage({ rating: amount, sl: 0, kind: "magical", school, ward: wardBySchool(s.ward)[school] ?? 0, immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false, dealtHalved: shaman ? dealtHalvedBy(shaman) : null });
  const dealt = result.immune ? 0 : Math.max(0, Math.trunc(Number(result.damage) || 0));
  await target.applyDamage(dealt, { struck: true, attack: false, location: "body", type: school, messageId: message.id, by: shaman ?? null, wardTook: result.wardTook ?? 0, mitigation: result.mitigationSource });
  return { ok: true, reason: null };
}

/**
 * The card's Apply: the one creature targeted (else selected), here where this client may write the
 * creature and the card, else on the active GM's client. A refusal is said in words.
 */
export async function eyeApply(message) {
  const picks = game.user?.targets?.size ? [...game.user.targets] : (canvas.tokens?.controlled ?? []);
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  const refusedNow = eyeStrikeRefusal({ named: picks.length, struck: flags.eyeStruck === true });
  if (refusedNow) {
    ui.notifications?.warn(game.i18n.format(EYE_REFUSALS[refusedNow], { feet: EYE_OF_THE_STORM.feet }));
    return { ok: false, reason: refusedNow };
  }
  const target = picks[0]?.actor ?? null;
  let done;
  try {
    if (target?.isOwner && message.isOwner) done = await eyeStrikeHere(message, target);
    else {
      const gm = game.users?.activeGM ?? null;
      if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      done = await gm.query(EYE_QUERY, { messageId: message.id, targetUuid: target?.uuid ?? null }, { timeout: 15000 });
    }
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ok: false, reason: "error" };
  }
  if (!done?.ok) ui.notifications?.warn(game.i18n.format(EYE_REFUSALS[done?.reason] ?? EYE_REFUSALS.one, { feet: EYE_OF_THE_STORM.feet }));
  return done;
}

/** The GM-side handler (`EYE_QUERY`): the asker must own the shaman; everything is judged again here. */
export async function eyeQueryHandler({ messageId = null, targetUuid = null } = {}, { user = null } = {}) {
  const message = messageId ? game.messages?.get(messageId) : null;
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  const shaman = eyeShamanOf(message).actor;
  if (!message || !shaman || (user && !shaman.testUserPermission(user, "OWNER"))) throw new Error(game.i18n.localize("AZEROTH.Card.NotYours"));
  return eyeStrikeHere(message, target?.documentName === "Actor" ? target : (target?.actor ?? null));
}

/* -------------------------------------------- */
/*  Herald of the Void's spread, applied once    */
/* -------------------------------------------- */

/** The query the spread is written through where this client may not write the creature or the card. */
export const HERALD_QUERY = "azeroth-rpg.heraldStrike";

/** The spread's words for a refusal tail (`heraldStrikeRefusal`). */
const HERALD_REFUSALS = Object.freeze({
  one: "AZEROTH.Audit.HeraldRefuse.one", other: "AZEROTH.Audit.HeraldRefuse.other", far: "AZEROTH.Audit.HeraldRefuse.far",
  unmeasured: "AZEROTH.Audit.HeraldRefuse.unmeasured", struck: "AZEROTH.Audit.HeraldRefuse.struck"
});

/**
 * **04's HERALD OF THE VOID'S SPREAD, JUDGED AND LANDED** (*one other creature of your choice within 10
 * feet of it takes the same damage*; the class talent audit's final review): the card is a Herald card, the
 * creature named is not the one the tick struck, it stands within 10 feet of that one - measured off the
 * scene's token documents the card names, and refused where it cannot be - and the card has not been
 * struck; claimed on the card before the damage, which is the card's own recorded amount, Shadow and
 * magical, through the creature's Shadow Ward (05 §15) as Eye of the Storm's strike is. `{ok, reason}`.
 */
async function heraldStrikeHere(message, target) {
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  if (flags.identifier !== HERALD_OF_THE_VOID.identifier) return { ok: false, reason: "one" };
  const caster = eyeShamanOf(message).actor;
  const from = flags.heraldFrom?.uuid ? await fromUuid(flags.heraldFrom.uuid) : null;
  const struck = from?.documentName === "Actor" ? from : (from?.actor ?? null);
  const scene = (flags.heraldFrom?.sceneId ? game.scenes?.get(flags.heraldFrom.sceneId) : null) ?? null;
  const { feetBetweenActors } = await import("../canvas/engaged.mjs");
  const feet = target && struck && scene ? feetBetweenActors(struck, target, scene) : null;
  const refused = heraldStrikeRefusal({
    named: target ? 1 : 0, feet, struck: flags.heraldStruck === true, measured: true,
    same: Boolean(target && struck && target.uuid === struck.uuid)
  });
  if (refused) return { ok: false, reason: refused };
  await message.update({ "flags.azeroth-rpg.heraldStruck": true });
  const amount = heraldCardAmount(flags);
  const { resolveRecordedDamage } = await import("../rules/damage-record.mjs");
  const { wardBySchool } = await import("../rules/ward.mjs");
  const { dealtHalvedBy } = await import("../rules/legacy-uses.mjs");
  const s = target.system ?? {};
  const school = HERALD_OF_THE_VOID.school;
  const result = resolveRecordedDamage({ rating: amount, sl: 0, kind: "magical", school, ward: wardBySchool(s.ward)[school] ?? 0, immune: s.immune ?? [], vulnerable: s.vulnerable ?? [], slAddsToDamage: false, dealtHalved: caster ? dealtHalvedBy(caster) : null });
  const dealt = result.immune ? 0 : Math.max(0, Math.trunc(Number(result.damage) || 0));
  await target.applyDamage(dealt, { struck: true, attack: false, location: "body", type: school, messageId: message.id, by: caster ?? null, wardTook: result.wardTook ?? 0, mitigation: result.mitigationSource });
  return { ok: true, reason: null };
}

/**
 * The Herald card's Apply: the one creature targeted (else selected), here where this client may write the
 * creature and the card, else on the active GM's client. A refusal is said in words.
 */
export async function heraldApply(message) {
  const picks = game.user?.targets?.size ? [...game.user.targets] : (canvas.tokens?.controlled ?? []);
  const flags = message?.flags?.["azeroth-rpg"] ?? {};
  const words = reason => game.i18n.format(HERALD_REFUSALS[reason] ?? HERALD_REFUSALS.one, { feet: HERALD_OF_THE_VOID.feet });
  const refusedNow = heraldStrikeRefusal({ named: picks.length, struck: flags.heraldStruck === true });
  if (refusedNow) {
    ui.notifications?.warn(words(refusedNow));
    return { ok: false, reason: refusedNow };
  }
  const target = picks[0]?.actor ?? null;
  let done;
  try {
    if (target?.isOwner && message.isOwner) done = await heraldStrikeHere(message, target);
    else {
      const gm = game.users?.activeGM ?? null;
      if (!gm) throw new Error(game.i18n.localize("AZEROTH.Rider.Inflict.NoGM"));
      done = await gm.query(HERALD_QUERY, { messageId: message.id, targetUuid: target?.uuid ?? null }, { timeout: 15000 });
    }
  } catch (err) {
    ui.notifications?.warn(err.message);
    return { ok: false, reason: "error" };
  }
  if (!done?.ok) ui.notifications?.warn(words(done?.reason));
  return done;
}

/** The GM-side handler (`HERALD_QUERY`): the asker must own the caster; everything is judged again here. */
export async function heraldQueryHandler({ messageId = null, targetUuid = null } = {}, { user = null } = {}) {
  const message = messageId ? game.messages?.get(messageId) : null;
  const target = targetUuid ? await fromUuid(targetUuid) : null;
  const caster = eyeShamanOf(message).actor;
  if (!message || !caster || (user && !caster.testUserPermission(user, "OWNER"))) throw new Error(game.i18n.localize("AZEROTH.Card.NotYours"));
  return heraldStrikeHere(message, target?.documentName === "Actor" ? target : (target?.actor ?? null));
}
