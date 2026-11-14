/**
 * **WHAT A DEATH KNIGHT SPELL DOES THAT NO DESCRIPTOR CARRIES** (07 §11, §14 and §17; run F4b).
 * The law is `rules/death-knight-spells.mjs`; this module only reads the world and writes, through
 * doors that exist:
 *
 * - `judgeDkSpell` - asked by `castSpell` with its other refusals, BEFORE the budget and the
 *   Runic Power (D-768's order): Death's Embrace's half-Health target, Pestilence's carrier and
 *   ring (the card's rows become the ring), Death Pact's undead you control, and a GM where a
 *   write lands on a creature this client does not own (`rules/gm-writes.mjs#gmAbsentFor`);
 * - `dkSpellAfterCast` - once the Casting Test went off: Frostwyrm Breath's Entangled on every
 *   creature with its escape (D-962), Death Pact's destruction and heal, Horn of Winter's Boons,
 *   Plaguesight's card;
 * - `dkSpellAfterResist` - a creature's failed Resist on a spell card: Soul Rend's no-healing mark,
 *   Blood Bind's and Chains of Ice's bars on the Slowed the failure laid, Chains of Ice's Slowed
 *   held to the spell's span with the repeated Test;
 * - `dkSpellAfterApply` - the card's Apply: Pestilence's diseases on each enemy it damaged, through
 *   the Plague's own door (`effects/death-knight.mjs#layPlagueOn`).
 */

import {
  carriedPlagues, deathPactHeal, deathPactRefusal, groundGrade, halfHealthRefusal, hornRefusal, keepLongerSpan, plaguesightRows, pestilenceRing,
  readAlwaysCondition, readDeathPact, readHorn, readNoHealingOnFail, readPestilence, readPlaguesight, readSlowedBars,
  readSlowedRest, readsCarrierTarget, readsControlledUndead, readsHalfHealth, SLOWED_BAR_FLAG, splitSlowedBars
} from "../rules/death-knight-spells.mjs";
import { AZEROTH } from "../config.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { ESCAPE_FLAG, cleanEscape, escapeRecord } from "../rules/escapes.mjs";
import { REACTION_BAR_FLAG } from "../rules/reaction-bar.mjs";
import { ROUND_SECONDS } from "../rules/area-ticks.mjs";

const SCOPE = "azeroth-rpg";

/** The query a write on a creature this client does not own goes through. */
export const DK_SPELL_QUERY = "azeroth-rpg.dkSpell";

/** The flag a spell's own Slowed carries where 07 bars Disengage while it stands (Chains of Ice). */
export const NO_DISENGAGE_FLAG = "noDisengage";

const t = (key, data = {}) => game.i18n.format(key, data);

/** The token a snapshot row names, on its own scene. */
function tokenOf(row) {
  const scene = (row?.sceneId && game.scenes?.get(row.sceneId)) || canvas?.scene || null;
  return row?.tokenId ? scene?.tokens?.get(row.tokenId) ?? null : null;
}

/** The actor a snapshot row names (a token's synthetic actor where it has one). */
async function actorOfRow(row) {
  const { targetActorOf } = await import("../dice/annotate.mjs");
  return targetActorOf(row);
}

/** The caster's token: the cast's source where given, else the first of its tokens on the viewed scene. */
function casterToken(actor, source = null) {
  const scene = (source?.sceneId && game.scenes?.get(source.sceneId)) || canvas?.scene || null;
  if (source?.tokenId) return scene?.tokens?.get(source.tokenId) ?? null;
  return scene?.tokens?.find?.(tk => tk.actor === actor || tk.actorId === actor?.id) ?? null;
}

/** Whether a creature is down: defeated, dead or at 0 Health as a creature. */
function isDown(token) {
  const a = token?.actor ?? null;
  if (!a) return true;
  return token.combatant?.isDefeated === true || a.statuses?.has?.(CONFIG.specialStatusEffects?.DEFEATED ?? "dead") === true
    || (a.type === "npc" && (Number(a.system?.health?.value) || 0) <= 0);
}

/** A row the card can carry, for a token (the roll dialog's own snapshot). */
async function snapshotsOf(tokens = []) {
  const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
  return targetSnapshots(tokens.map(tk => tk.object ?? { id: tk.id, actor: tk.actor, name: tk.name, scene: tk.parent }));
}

/** Refuse in words and stop. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(key, data));
  return null;
}

/* -------------------------------------------- */
/*  Judged before anything is paid               */
/* -------------------------------------------- */

/**
 * **A DEATH KNIGHT SPELL, JUDGED BEFORE THE BUDGET AND THE RUNIC POWER** (D-768's order). Null
 * where it is refused (said in words), else the plan and the card's rows (Pestilence's are the
 * ring around the carrier, not the carrier).
 *
 * @param {{actor: Actor, spell: Item, list: object[], source?: object|null}} o
 * @returns {Promise<{plan: object|null, list: object[]}|null>}
 */
export async function judgeDkSpell({ actor, spell, list = [], source = null } = {}) {
  const sys = spell?.system ?? {};
  const name = spell?.name ?? "";
  const plan = {};
  let rows = list;
  // 07 §17's Death's Embrace: *One creature with half its Health or less*.
  if (readsHalfHealth(sys.target)) {
    if (!rows.length) return refuse("AZEROTH.DeathKnight.Spell.Refuse.noTarget", { spell: name });
    for (const row of rows) {
      const victim = await actorOfRow(row);
      const no = halfHealthRefusal(victim?.system?.health ?? {});
      if (no) return refuse(`AZEROTH.DeathKnight.Spell.Refuse.${no}`, { spell: name, name: row?.name ?? victim?.name ?? "" });
    }
  }
  // 07 §17's Pestilence: the carrier of the knight's own disease, and the enemies around it.
  const pest = readsCarrierTarget(sys.target) ? readPestilence(sys.effect) : null;
  if (pest) {
    if (rows.length !== 1) return refuse("AZEROTH.DeathKnight.Spell.Refuse.oneCarrier", { spell: name });
    const carrier = await actorOfRow(rows[0]);
    const carrierToken = tokenOf(rows[0]);
    const kinds = carriedPlagues((carrier?.effects ?? []).map(e => ({ tick: e.flags?.[SCOPE]?.tick ?? null, active: e.active })), actor.uuid);
    if (!carrier || !kinds.length) return refuse("AZEROTH.DeathKnight.Spell.Refuse.notCarrier", { spell: name, name: rows[0]?.name ?? carrier?.name ?? "" });
    if (!carrierToken) return refuse("AZEROTH.DeathKnight.Spell.Refuse.unplaced", { spell: name, name: rows[0]?.name ?? carrier.name });
    const { feetApart } = await import("../canvas/footprints.mjs");
    const { relationTo } = await import("./area-strikes.mjs");
    const own = casterToken(actor, source);
    const candidates = [];
    for (const tk of carrierToken.parent?.tokens ?? []) {
      if (!tk.actor || tk.id === carrierToken.id) continue;
      candidates.push({
        id: tk.id, name: tk.name ?? tk.actor.name, feet: feetApart(carrierToken, tk),
        enemy: relationTo({ caster: actor, casterToken: own, actor: tk.actor, token: tk }) === "enemy",
        down: isDown(tk), hidden: tk.hidden === true && game.user?.isGM !== true
      });
    }
    const ids = pestilenceRing(candidates, { carrierId: carrierToken.id, feet: pest.feet });
    if (!ids.length) return refuse("AZEROTH.DeathKnight.Spell.Refuse.noRing", { spell: name, name: rows[0]?.name ?? carrier.name, n: pest.feet });
    rows = await snapshotsOf(ids.map(id => carrierToken.parent.tokens.get(id)).filter(Boolean));
    plan.card = { pestilence: { kinds, carrier: rows.length ? (carrierToken.name ?? carrier.name) : "" } };
  }
  // 07 §17's Death Pact: *One undead creature you control*.
  const pact = readsControlledUndead(sys.target) ? readDeathPact(sys.effect) : null;
  if (pact) {
    if (rows.length !== 1) return refuse("AZEROTH.DeathKnight.Spell.Refuse.oneServant", { spell: name });
    const token = tokenOf(rows[0]);
    const victim = token?.actor ?? await actorOfRow(rows[0]);
    const { bondOf, worldActorOf } = await import("../documents/bound.mjs");
    const { kindsOfActor } = await import("./area-strikes.mjs");
    const world = worldActorOf(victim);
    const no = deathPactRefusal({ ownerUuid: bondOf(world)?.ownerUuid ?? null, casterUuid: actor.uuid, undead: kindsOfActor(victim).has("undead") });
    if (no) return refuse(`AZEROTH.DeathKnight.Spell.Refuse.${no}`, { spell: name, name: rows[0]?.name ?? victim?.name ?? "" });
    if (!token) return refuse("AZEROTH.DeathKnight.Spell.Refuse.unplaced", { spell: name, name: rows[0]?.name ?? victim?.name ?? "" });
    // Only a GM deletes a token: refused here, before the Runic Power (`rules/gm-writes.mjs`).
    if (gmAbsentFor({ owned: [false], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("AZEROTH.DeathKnight.Spell.Refuse.noGM", { spell: name });
    plan.deathPact = { sceneId: token.parent?.id ?? null, tokenId: token.id, cap: pact.cap };
  }
  // 07 §11's Frostwyrm Breath: every creature in the cone Entangled (D-962), on creatures another
  // client owns through the GM's - refused up front where no GM could write it.
  const always = readAlwaysCondition(sys.effect);
  if (always) {
    const owned = [];
    for (const row of rows) owned.push(Boolean((await actorOfRow(row))?.isOwner));
    if (gmAbsentFor({ owned, isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) })) return refuse("AZEROTH.DeathKnight.Spell.Refuse.noGM", { spell: name });
    plan.always = always;
  }
  // 07 §11's Horn of Winter: a Boon laid on every ally within reach, through the GM's client on a
  // creature another client owns (`effects/banes.mjs#layBoon`) - so the allies are measured HERE,
  // with the other refusals, and the cast refused in words before anything is spent where no GM
  // could write one of them (the F4b review, M1). The cast lays the Boon on exactly these.
  const horn = readHorn(sys.effect);
  if (horn) {
    const reached = await hornReach(actor, horn, source);
    const no = hornRefusal(reached.map(r => ({ owned: r.actor?.isOwner === true })), { isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) });
    if (no) return refuse(`AZEROTH.DeathKnight.Spell.Refuse.${no}`, { spell: name });
    plan.horn = { ...horn, reached };
  }
  if (readPlaguesight(sys.effect)) plan.plaguesight = readPlaguesight(sys.effect);
  return { plan: Object.keys(plan).length ? plan : null, list: rows };
}

/* -------------------------------------------- */
/*  Once the cast went off                       */
/* -------------------------------------------- */

/**
 * **WHAT THE CAST DOES ONCE ITS TEST SUCCEEDED** (07 §8: a failed cast spends its Runic Power and
 * does nothing). Answers the card's lines.
 *
 * @param {{actor: Actor, spell: Item, plan: object, list: object[], spellDC: number|null, cast: string|null, source?: object|null}} o
 * @returns {Promise<string[]>}
 */
export async function dkSpellAfterCast({ actor, spell, plan = null, list = [], spellDC = null, cast = null, source = null } = {}) {
  const lines = [];
  if (!plan) return lines;
  const name = spell?.name ?? "";
  if (plan.always) {
    const { inflictCondition } = await import("./inflict.mjs");
    const record = escapeRecord({ ...plan.always, banes: 0 }, { dc: Number.isFinite(Number(spellDC)) ? Number(spellDC) : null, caster: actor.uuid, source: name, cast });
    for (const row of list) {
      const victim = await actorOfRow(row);
      if (!victim) continue;
      const landed = await inflictCondition({ victim, id: plan.always.condition, by: actor, name: row?.name ?? victim.name, until: null, marks: record ? { [ESCAPE_FLAG]: record } : {} });
      lines.push(t(landed?.landed ? "AZEROTH.DeathKnight.Spell.AlwaysLanded" : "AZEROTH.DeathKnight.Spell.AlwaysNot", {
        name: row?.name ?? victim.name, spell: name, condition: game.i18n.localize(AZEROTH.conditions?.[plan.always.condition] ?? plan.always.condition)
      }));
    }
  }
  if (plan.deathPact) lines.push(...await deathPactLands(actor, spell, plan.deathPact));
  if (plan.horn) lines.push(...await hornLands(actor, spell, plan.horn, source));
  if (plan.plaguesight) lines.push(...await plaguesightLands(actor, spell, plan.plaguesight, source));
  return lines;
}

/** Death Pact: the servant destroyed on the GM's client, the Health it had back, to the cap. */
async function deathPactLands(actor, spell, pact) {
  const name = spell?.name ?? "";
  let done = null;
  try {
    const payload = { act: "deathPact", casterUuid: actor.uuid, sceneId: pact.sceneId, tokenId: pact.tokenId };
    done = game.user?.isGM && game.users?.activeGM?.isSelf
      ? await dkSpellQueryHandler(payload, { user: game.user })
      : await game.users.activeGM.query(DK_SPELL_QUERY, payload, { timeout: 15000 });
  } catch (err) {
    ui.notifications?.warn(err.message);
    return [err.message];
  }
  const heal = deathPactHeal(done?.health ?? 0, pact.cap);
  const before = actor.system?.health?.value ?? 0;
  // A Death spell the knight casts on itself: the one healing door judges it (undead, Death magic).
  if (heal > 0) await actor.applyHealing(heal, { from: actor, spell: true, school: "death" });
  const healed = Math.max(0, (actor.system?.health?.value ?? before) - before);
  return [t("AZEROTH.DeathKnight.Spell.DeathPact", { name: actor.name, servant: done?.name ?? "", n: healed, had: done?.health ?? 0, spell: name })];
}

/** Horn of Winter: a Boon laid on every ally the judgement measured, the knight included. */
async function hornLands(actor, spell, horn, source) {
  const lines = [];
  const own = casterToken(actor, source);
  const name = spell?.name ?? "";
  const { layBoon } = await import("./banes.mjs");
  const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
  const reached = Array.isArray(horn.reached) ? horn.reached : await hornReach(actor, horn, source);
  // (The F4c review's note, accepted as narrow: the list was measured at the judgement and can go
  // stale across the roll dialog and the Casting Test - a creature that stepped out still gets the
  // Boon - and a GM who leaves in that window makes a lay on another client's creature warn here,
  // after the Runic Power was paid.)
  for (const r of reached) {
    const laid = await layBoon({ victim: r.actor, kind: horn.kind, boons: horn.boons, source: name, by: actor, span: untilEndOfNextTurnOrRound(r.actor) });
    lines.push(t(laid ? "AZEROTH.DeathKnight.Spell.HornLaid" : "AZEROTH.DeathKnight.Spell.HornNot", { name: r.name, spell: name }));
  }
  if (!own) lines.push(t("AZEROTH.DeathKnight.Spell.HornUnplaced", { name: actor.name, spell: name }));
  return lines;
}

/**
 * **THE ALLIES HORN OF WINTER REACHES**: the knight where 07 says *you included*, and every ally
 * standing within reach of the knight's token - never a defeated creature, never one hidden from
 * this player - in the scene's token order. Asked by the judgement, before anything is spent.
 */
async function hornReach(actor, horn, source) {
  const own = casterToken(actor, source);
  const reached = [];
  if (horn.includesYou) reached.push({ actor, name: own?.name ?? actor.name });
  if (own) {
    const { feetApart } = await import("../canvas/footprints.mjs");
    const { relationTo } = await import("./area-strikes.mjs");
    for (const tk of own.parent?.tokens ?? []) {
      if (!tk.actor || tk.id === own.id || tk.actor === actor || isDown(tk)) continue;
      if (tk.hidden && game.user?.isGM !== true) continue;
      const feet = feetApart(own, tk);
      if (!(typeof feet === "number" && feet <= horn.feet + 1e-6)) continue;
      if (relationTo({ caster: actor, casterToken: own, actor: tk.actor, token: tk }) !== "ally") continue;
      reached.push({ actor: tk.actor, name: tk.name ?? tk.actor.name });
    }
  }
  return reached;
}

/**
 * Plaguesight: a card whispered to the caster alone, naming the creatures within reach that carry
 * Undeath, their direction and highest threshold, and the ground's grade. **A hidden token is
 * sensed** (the lead on O-372, run F4b, D-989: *"Plague sight does reveal hidden tokens."*): it is
 * named on the caster's card and nowhere else - the token stays hidden on the board, and no other
 * player is told.
 */
async function plaguesightLands(actor, spell, sight, source) {
  const own = casterToken(actor, source);
  const name = spell?.name ?? "";
  const out = [];
  if (own) {
    const { feetApart } = await import("../canvas/footprints.mjs");
    const rows = [];
    const at = own.object?.center ?? { x: own.x, y: own.y };
    for (const tk of own.parent?.tokens ?? []) {
      const a = tk.actor;
      // A hidden token is sensed too (D-989); the card below reaches the caster alone.
      if (!a || tk.id === own.id) continue;
      const there = tk.object?.center ?? { x: tk.x, y: tk.y };
      rows.push({
        id: tk.id, name: tk.name ?? a.name, feet: feetApart(own, tk), dx: there.x - at.x, dy: there.y - at.y,
        value: a.type === "character" ? (Number(a.system?.corruption?.[sight.track]) || 0) : 0,
        keyword: a.type === "npc" && a.system?.corruption === sight.track
      });
    }
    for (const r of plaguesightRows(rows, { feet: sight.feet, thresholds: sight.thresholds })) {
      out.push(t(r.threshold === null ? "AZEROTH.DeathKnight.Spell.SightKeyword" : "AZEROTH.DeathKnight.Spell.SightRow", {
        name: r.name, feet: Math.round(r.feet), direction: game.i18n.localize(`AZEROTH.Compass.${r.direction}`),
        threshold: r.threshold ? String(r.threshold) : game.i18n.localize("AZEROTH.DeathKnight.Spell.SightNone")
      }));
    }
    if (!out.length) out.push(t("AZEROTH.DeathKnight.Spell.SightNobody", { n: sight.feet }));
  } else out.push(t("AZEROTH.DeathKnight.Spell.SightUnplaced", { name: actor.name, spell: name }));
  if (sight.ground) {
    let grade = 0;
    try {
      const { mapState } = await import("../settings.mjs");
      const { exposureFor, partyRegion } = await import("../rules/regions.mjs");
      const region = partyRegion(mapState());
      grade = region ? groundGrade(exposureFor(region.key).grades, sight.track) : 0;
    } catch {
      grade = 0;
    }
    out.push(t(grade ? "AZEROTH.DeathKnight.Spell.SightGround" : "AZEROTH.DeathKnight.Spell.SightClean", { n: grade }));
  }
  // **TO THE CASTER ALONE** (the lead's ruling, D-989): the players who own the knight, or - a knight
  // only a GM owns - the GM who cast it. A hidden creature is named here and to nobody else.
  const players = [...(game.users ?? [])].filter(u => !u.isGM && actor.testUserPermission?.(u, "OWNER")).map(u => u.id);
  const whisper = players.length ? [...new Set(players)] : [game.user?.id].filter(Boolean);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper,
    content: `<p><strong>${name}</strong></p>${out.map(l => `<p class="azeroth-drain">${l}</p>`).join("")}`,
    flags: { [SCOPE]: { kind: "plaguesight" } }
  });
  return [t("AZEROTH.DeathKnight.Spell.SightSent", { name: actor.name, spell: name })];
}

/* -------------------------------------------- */
/*  A failed Resist and the card's Apply         */
/* -------------------------------------------- */

/**
 * **WHAT A FAILED RESIST ON A DEATH KNIGHT SPELL'S CARD LAYS BESIDE ITS CONDITIONS**, on the
 * client that rolled the Test (which owns the creature). Read off the entry's own words on the
 * card (`effectHTML`). Guarded by the caller.
 *
 * @param {{message: ChatMessage, actor: Actor, maker: Actor|null}} o
 * @returns {Promise<string[]>}
 */
export async function dkSpellAfterResist({ message, actor, maker = null, laid = {} } = {}) {
  const lines = [];
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "spell" || !actor) return lines;
  const effect = flags.effectHTML ?? "";
  const spell = flags.spellName ?? flags.title ?? "";
  // Soul Rend: *cannot regain Health until the end of its next turn* - the creature's own turn.
  const noHeal = readNoHealingOnFail(effect);
  if (noHeal) {
    const { layNoHealing } = await import("./no-healing.mjs");
    const done = await layNoHealing({ victim: actor, striker: maker, source: spell, name: actor.name, span: noHeal.span });
    lines.push(t(done?.landed ? "AZEROTH.DeathKnight.Spell.NoHealing" : "AZEROTH.DeathKnight.Spell.NoHealingNot", { name: actor.name, spell }));
  }
  const bars = readSlowedBars(effect);
  const rest = readSlowedRest(effect);
  if (bars || rest) {
    // **THE SLOWED THIS FAILURE LAID, NEVER THE FIRST ONE FOUND** (the F4b review, S4): the effect
    // the Resist door wrote for this card (`laid.slowed`). Where the creature was already Slowed -
    // by Icy Touch, Remorseless Winter or an earlier Chains - it is that one effect, and it keeps
    // the longer of its old span and this spell's, and its own escape where it had one.
    const record = laid?.slowed ?? null;
    const slowed = record?.effectId ? (actor.effects?.get?.(record.effectId) ?? null) : null;
    if (slowed) {
      const prior = record.prior ?? null;
      const update = {};
      // Blood Bind: no Reactions while this Slowed stands - the reaction bar the budget reads.
      if (bars?.reactions) update[`flags.${SCOPE}.${REACTION_BAR_FLAG}`] = { ownerUuid: actor.uuid, cardUuid: message.uuid };
      // Chains of Ice: no Disengage while this Slowed stands.
      if (bars?.disengage) update[`flags.${SCOPE}.${NO_DISENGAGE_FLAG}`] = { source: spell };
      // The span this spell gives the Slowed: the minute where 07 says *for the rest of the
      // duration*, else what the shared door just wrote.
      const { minuteSpan } = await import("./durations.mjs");
      const minute = rest ? (minuteSpan(actor) ?? null) : null;
      // THIS spell's span on the Slowed, read before anything below rewrites it: the minute, else
      // what the shared door just wrote (finding 6, D-997).
      // **THIS FAILURE'S OWN SPAN, AS THE RESIST DOOR RECORDED IT** (the close review's findings 1
      // and 2): the condition door now keeps a longer older span, so the Slowed may already carry
      // the older one; `record.own` is what this failure asked for. An older record without it
      // reads the effect, as before.
      const own = record && Object.hasOwn(record, "own") && record.own ? record.own : null;
      const ownSpan = minute ?? (own ? foundry.utils.deepClone(own)
        : { duration: foundry.utils.deepClone(slowed._source?.duration ?? {}), start: foundry.utils.deepClone(slowed._source?.start ?? {}) });
      let keptPrior = false;
      if (prior) {
        const per = { rounds: Number(CONFIG.time?.roundTime) || 6, seconds: 1, minutes: 60, hours: 3600, days: 86400 }[minute?.duration?.units] ?? null;
        const { spanReadOf } = await import("./durations.mjs");
        const next = minute
          ? { temporary: true, secondsRemaining: per ? Number(minute.duration?.value) * per : null, remaining: Number(minute.duration?.value), units: minute.duration?.units ?? null, minute: true }
          : spanReadOf(own ?? slowed);
        // O-384 (run close-F2): both spans read in seconds at 05's six-second round (the accessor
        // `effects/durations.mjs` reads), so the one that ends later stands.
        keptPrior = keepLongerSpan(prior, next, { roundSeconds: ROUND_SECONDS }) === "prior";
        if (keptPrior) Object.assign(update, { duration: prior.duration ?? {}, start: prior.start ?? {} });
        else if (minute) Object.assign(update, minute);
      } else if (minute) Object.assign(update, minute);
      // The older Slowed's own escape stands where it had one; else the repeated Test moves here.
      const priorEscape = cleanEscape(prior?.escape ?? null);
      if (priorEscape) update[`flags.${SCOPE}.${ESCAPE_FLAG}`] = priorEscape;
      if (rest) {
        // *Slowed for the rest of the duration*: the repeated Test rides the Slowed, since the
        // Entangled ends at the end of the next turn by itself.
        const entangledId = laid?.entangled?.effectId ?? null;
        const entangled = (entangledId ? actor.effects?.get?.(entangledId) : null)
          ?? (actor.effects ?? []).find(e => e.statuses?.has?.("entangled") && cleanEscape(e.flags?.[SCOPE]?.[ESCAPE_FLAG] ?? null)?.cast === flags.cast) ?? null;
        const held = cleanEscape(entangled?.flags?.[SCOPE]?.[ESCAPE_FLAG] ?? null);
        if (held && !priorEscape) update[`flags.${SCOPE}.${ESCAPE_FLAG}`] = cleanEscape({ ...held, condition: "slowed" });
        if (entangled && held && held.cast === flags.cast) {
          // An Entangled the creature already carried keeps the escape it had before this card.
          const before = cleanEscape(laid?.entangled?.prior?.escape ?? null);
          if (before) await entangled.setFlag(SCOPE, ESCAPE_FLAG, before);
          else await entangled.unsetFlag(SCOPE, ESCAPE_FLAG);
        }
      }
      // **THE BARS LAST AS LONG AS THIS SPELL'S SLOWED** (*While it is Slowed by this spell*; the
      // final review's finding 6, D-997): where the older Slowed's longer span is kept, the bars
      // ride an effect of their own spanned by this spell's Slowed, and the Disengage door reads
      // it only while the creature is still Slowed (`noDisengageBy`).
      const split = splitSlowedBars(update, { keptPrior, scope: SCOPE, keys: [REACTION_BAR_FLAG, NO_DISENGAGE_FLAG] });
      if (split.bar) {
        const stale = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.[SLOWED_BAR_FLAG]?.cardUuid === message.uuid).map(e => e.id);
        if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
        await actor.createEmbeddedDocuments("ActiveEffect", [{
          name: t("AZEROTH.DeathKnight.Spell.SlowedBarName", { spell }), img: "icons/svg/downgrade.svg", origin: message.uuid,
          ...ownSpan, system: { changes: [] },
          flags: { [SCOPE]: { ...split.bar[SCOPE], [SLOWED_BAR_FLAG]: { cardUuid: message.uuid } } }
        }]);
      }
      if (Object.keys(split.slowed).length) await slowed.update(split.slowed);
      if (bars?.reactions) lines.push(t("AZEROTH.DeathKnight.Spell.NoReactions", { name: actor.name, spell }));
      if (bars?.disengage) lines.push(t("AZEROTH.DeathKnight.Spell.NoDisengageLaid", { name: actor.name, spell }));
    }
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/**
 * **WHETHER A SPELL'S OWN SLOWED BARS THIS CREATURE'S DISENGAGE** (07 §11's Chains of Ice), or
 * null: the Disengage door asks it before the Half-Action is spent.
 */
export function noDisengageBy(actor) {
  // The bar rides the spell's Slowed, or an effect of its own spanned by that Slowed (finding 6,
  // D-997): either way it bars only while the creature is Slowed.
  if (!actor?.statuses?.has?.("slowed")) return null;
  const e = (actor?.effects ?? []).find(x => x.active !== false && x.disabled !== true && x.flags?.[SCOPE]?.[NO_DISENGAGE_FLAG]);
  return e ? { source: String(e.flags[SCOPE][NO_DISENGAGE_FLAG].source ?? e.name ?? "") } : null;
}

/**
 * **PESTILENCE AT THE APPLY** (07 §17: *Every enemy damaged this way gains the target's disease, as
 * if your **Plague** had laid it*): each disease the card recorded off the carrier, laid on the
 * creature the Apply just damaged through the Plague's own door. Guarded by the caller.
 *
 * @param {{message: ChatMessage, target: Actor, amount: number}} o
 * @returns {Promise<string[]>}
 */
export async function dkSpellAfterApply({ message, target, amount = 0 } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  const pest = flags.deathKnightSpell?.pestilence ?? null;
  if (flags.kind !== "spell" || !pest || !(Number(amount) > 0) || !target) return [];
  const knight = ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
  if (!knight) return [];
  const { layPlagueOn } = await import("./death-knight.mjs");
  const lines = [];
  for (const kind of Array.isArray(pest.kinds) ? pest.kinds : []) {
    if (kind !== "frostFever" && kind !== "bloodPlague") continue;
    lines.push((await layPlagueOn({ victim: target, kind, by: knight })).text);
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/* -------------------------------------------- */
/*  The GM's handler                             */
/* -------------------------------------------- */

/**
 * **DEATH PACT ON THE GM'S CLIENT** (`DK_SPELL_QUERY`): the asker owns the caster; the token stands
 * on its scene; its creature's bond names the caster and it is undead - judged again here off the
 * world, never off the payload. The token goes (the whole raise where it is the last of it, through
 * the called creature's path). Throws with the reason.
 */
export async function dkSpellQueryHandler(payload = {}, { user = null } = {}) {
  if (payload.act !== "deathPact") throw new Error(`dkSpell: no such act ${JSON.stringify(payload.act ?? null)}`);
  const caster = payload.casterUuid ? await fromUuid(payload.casterUuid) : null;
  if (caster?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  if (user && !user.isGM && !caster.testUserPermission(user, "OWNER")) throw new Error(t("AZEROTH.Reaction.Refuse.NotYours", { name: caster.name }));
  const scene = game.scenes?.get(payload.sceneId) ?? null;
  const token = scene?.tokens?.get(payload.tokenId) ?? null;
  if (!token?.actor) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
  const { bondOf, unbindQueryHandler, worldActorOf } = await import("../documents/bound.mjs");
  const { kindsOfActor } = await import("./area-strikes.mjs");
  const world = worldActorOf(token.actor);
  const no = deathPactRefusal({ ownerUuid: bondOf(world)?.ownerUuid ?? null, casterUuid: caster.uuid, undead: kindsOfActor(token.actor).has("undead") });
  if (no) throw new Error(t(`AZEROTH.DeathKnight.Spell.Refuse.${no}`, { spell: "", name: token.name ?? token.actor.name }));
  const health = Math.max(0, Math.trunc(Number(token.actor.system?.health?.value)) || 0);
  const name = token.name ?? token.actor.name;
  const others = game.scenes.some(s => s.tokens.some(tk => tk.actorId === world?.id && !(s.id === scene.id && tk.id === token.id)));
  if (world && !others) await unbindQueryHandler({ uuid: world.uuid }, { user: game.user });
  else await scene.deleteEmbeddedDocuments("Token", [token.id]);
  return { health, name };
}
