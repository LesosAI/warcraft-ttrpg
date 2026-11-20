/**
 * **WHAT A SOVEREIGN SPELL DOES THAT NO DESCRIPTOR CARRIES** (07 §17, *Restricted Sovereign*; the San'layn
 * and Sovereign plan, B.10 and B.11; D-1240 onward). The law is `rules/sovereign-spells.mjs`; this
 * module only reads the world and writes, through doors that exist:
 *
 * - `judgeSovereignSpell` - asked by `castSpell` with its other refusals, BEFORE the budget and the
 *   Vitae (D-768's order): the rings round the caster and Twilight Bloodbolt's splash (the card's rows
 *   become them), Embrace of the Vampyr's held target, Swarming Shadows' and Royal Approach's prey,
 *   Mirror of Self's trigger, the roleplay spells' picks, and a GM where a write lands on a creature
 *   this client does not own (`rules/gm-writes.mjs#gmAbsentFor`);
 * - `sovereignCardRows` - the card's rows once the damage is worked out: Bloodbolt's heal is the
 *   caster's, and only off its prey;
 * - `sovereignSpellAfterCast` - once the Casting Test went off: the caster's own states and the
 *   roleplay spells;
 * - `sovereignSpellAfterResist` - a creature's failed Resist on a Sovereign card: the blood curse (02
 *   §7) with its repeat, Bleeding at its number, the lost damage, no healing, Overawe's Bane, Captivating
 *   Gaze's leash, Royal Command's and Grant an Audience's ends, the caster's heal for each failure;
 * - `sovereignSpellAfterApply` - the card's Apply: the Bleeding a hit lays, the prey's Tribute, Aortic
 *   Unraveling's kill, Embrace's feeding;
 * - in the blow (`AzerothActor#applyDamage`): Mirror of Self's Reaction, Majesty Unbound, the curses'
 *   lost damage and the harm that ends a command; in the hold (`_holdAtOne`): Unfading Glory;
 * - at a turn's start (`AzerothCombat#_effectTicks`): Bleed for Me's heal and Overawe's Bane.
 */

import {
  ATTACK_LESS_FLAG, BLED_AT_FLAG, BLOOD_CURSE_FLAG, COMMAND_FLAG, BLOOD_HELD_FLAG, CURSE_CONDITION, LOOK_FLAG, MAJESTY_FLAG, NO_APPLY, OATH_FLAG,
  SEAL_FLAG, SKILL_BOON_FLAG, UNFADING_FLAG, addHeldBlood, approachRefusal, bloodAgeRefusal, bloodCurseRecord, failHealAmount,
  halfDown, harmEnds, heldBloodWithin, heldTargetRefusal, hitBleedFor, killTributeGain, limitWords, majestyExtra,
  mirrorRefusal, readApproach, readAttackLess, readAudience, readBloodAge, readCasterBleedHeal, readCommand, readFailBleed,
  readFailHeal, readFeedsOn, readFirstAttackBane, readFlight, readGaze, readHerald, readHitBleed, readKillTribute, readMajesty,
  readMedicineAtDC, readMirror, readNeedsHeld, readNoHealing, readOath, readPreyArea, readPreyHeal, readPreyTribute,
  readRefusedConditions, readSeal, readSelfRing, readSkillBoon, readSplash, readSwarmEyes, readTaste, readThroneGaze,
  readUnfading, ringRows, sealOpened, sovereignCaster, unfadingHolds,
  BOND_FLAG, BURDEN_FLAG, HEMOPLAGUE_FLAG, VEIL_FLAG, WEAPON_LESS_FLAG, bondRefusal, burdensOn, halfModifier, livingKindRefusal,
  plusConAmount, pullFeet, readAlsoConditions, readBond, readCarriedArea, readDraught, readHarmEnds, readLaidVulnerable, readLivingKind,
  readNextAttackBane, readPull, readRetaliation, readScent, readShield, readSpread, readTickDrain, readVeil, readWeaponLess, scentRows,
  spreadRows
} from "../rules/sovereign-spells.mjs";
import { ESCAPE_CONDITIONS, ESCAPE_FLAG } from "../rules/escapes.mjs";
import { VULNERABLE_FLAG } from "../rules/laid-vulnerable.mjs";
import { FEED_DAYS_FLAG, feedDaysOf } from "../rules/feeding.mjs";
import { IMMUNE_FLAG } from "../rules/legacy-uses.mjs";
import { AZEROTH } from "../config.mjs";
import { NO_HEALING_FLAG } from "../rules/no-healing.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { SPELL_EFFECT_KEYS, burdenClaim, draughtClaim, layJudgement, mirrorClaim, namedBy } from "../rules/sovereign-asks.mjs";
import { onClawHit } from "../rules/claw-hit.mjs";
import { SUMMONS_PULL_KEY } from "../rules/sovereign-animations.mjs";

const SCOPE = "azeroth-rpg";

/** The query a write on a creature, a door or the caster this client does not own goes through. */
export const SOVEREIGN_SPELL_QUERY = "azeroth-rpg.sovereignSpell";

/** The flag Bleed for Me's Bleeding carries: the caster it heals, and the Spell DC its Medicine Test is against. */
export const BLEED_FOR_ME_FLAG = "bleedForMe";

/** The flag Overawe's curse carries, which the creature's turn starts restock its Bane from. */
export const OVERAWE_FLAG = "overawe";

/** The flag a command or an audience carries (the rules module's; re-exported for the tests). */
export { COMMAND_FLAG } from "../rules/sovereign-spells.mjs";

/** The leash a Captivating Gaze lays (FEATURES' `rules/leash.mjs` reads the same flag; C7). */
export const LEASH_FLAG = "leash";

/** The flag Majesty Unbound's once-a-turn heal is marked on, on the caster. */
const MAJESTY_HEALED_FLAG = "majestyHealed";

const t = (key, data = {}) => game.i18n.format(key, data);
const isGM = () => game.user?.isGM === true;

/** Refuse in words and stop. */
function refuse(key, data = {}) {
  ui.notifications?.warn(t(`AZEROTH.SovSpell.Refuse.${key}`, data));
  return null;
}

/** Whether a GM is needed and absent for writes on creatures this client may not own. */
function noGM(owned = []) {
  return gmAbsentFor({ owned, isGM: isGM(), gmActive: Boolean(game.users?.activeGM) });
}

/** The Sovereign doors carry this cast (`sovereignCaster`). */
export function sovereignScope(sys = {}, actor = null) {
  return sovereignCaster(sys?.classes ?? [], actor?.classNames ?? []);
}

/** The token a snapshot row names, on its own scene. */
function tokenOfRow(row) {
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

/** A creature's side as the caster sees it: `enemy`, `ally` or `neutral` (`area-strikes.mjs#relationTo`). */
async function relationOf(actor, own, other, token) {
  const { relationTo } = await import("./area-strikes.mjs");
  return relationTo({ caster: actor, casterToken: own, actor: other, token });
}

/** The candidates on a token's scene for a ring round it, as `ringRows` reads them. */
async function ringCandidates(actor, own, centre) {
  const { feetApart } = await import("../canvas/footprints.mjs");
  const out = [];
  for (const tk of centre.parent.tokens) {
    if (!tk.actor || tk.id === centre.id) continue;
    out.push({ id: tk.id, name: tk.name ?? tk.actor.name, feet: feetApart(centre, tk), enemy: (await relationOf(actor, own, tk.actor, tk)) === "enemy", down: isDown(tk), hidden: tk.hidden === true && !isGM() });
  }
  return out;
}

/** The players who own an actor, or - one only a GM owns - this user. */
function whisperTo(actor) {
  const players = [...(game.users ?? [])].filter(u => !u.isGM && actor?.testUserPermission?.(u, "OWNER")).map(u => u.id);
  return players.length ? [...new Set(players)] : [...(game.users ?? [])].filter(u => u.isGM).map(u => u.id);
}

/** A card to a creature's owners alone, with an optional button row (`data-sov-press`). */
async function whisperCard(actor, title, lines, { kind = "sovereignSpell", presses = [], flags = {}, audience = null } = {}) {
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const buttons = presses.length
    ? `<div class="azeroth-card-actions" data-reaction-owner="${esc(audience ?? actor.uuid)}">${presses.map(p => `<button type="button" data-action="sovereignCard" data-sov-press="${esc(p.press)}">${esc(p.label)}</button>`).join("")}</div>`
    : "";
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: whisperTo(actor),
    content: `<div class="azeroth azeroth-card"><div class="azeroth-card-body"><p><strong>${esc(title)}</strong></p>${lines.map(l => `<p class="azeroth-drain">${l}</p>`).join("")}${buttons}</div></div>`,
    flags: { [SCOPE]: { kind, ...flags } }
  });
}

/**
 * **A PUBLIC CARD FOR AN EVENT NO CAST CARD RECORDS** (Burden of Sin striking back, Hemoplague's spread; D-1392):
 * spoken from the token it happened at, naming the event by one flag, which the animation director reads as its
 * cue (`rules/sovereign-animations.mjs#SOV_CARD_CUES`). Null where there is nothing to say.
 */
async function eventCard(actor, token, lines, flags = {}) {
  const body = (lines ?? []).filter(Boolean).map(l => `<p class="azeroth-drain">${foundry.utils.escapeHTML(String(l))}</p>`).join("");
  if (!body) return null;
  const speaker = token ? ChatMessage.getSpeaker({ token, actor }) : ChatMessage.getSpeaker({ actor });
  return ChatMessage.create({ speaker, content: body, flags: { [SCOPE]: { kind: "sovereign", ...flags } } });
}

/** Ask the active GM, or answer here where this client is it. */
async function askGM(payload) {
  if (isGM() && game.users?.activeGM?.isSelf) return sovereignSpellQueryHandler(payload, { user: game.user });
  const gm = game.users?.activeGM ?? null;
  if (!gm) throw new Error(game.i18n.localize("AZEROTH.Bound.NoGM"));
  return gm.query(SOVEREIGN_SPELL_QUERY, payload, { timeout: 15000 });
}

/** The card's resolved span on a creature (the Necromancer's `castSpan`, D-1099). */
async function castSpan(actor, spec, caster = null) {
  if (!spec) return {};
  const { spanOn, clockRounds } = await import("./durations.mjs");
  const timed = spanOn(actor, spec, caster);
  if (timed) return timed;
  if (spec.units === "rounds" || spec.units === "turns") return clockRounds(Math.max(1, Math.trunc(Number(spec.value)) || 1));
  return {};
}

/** A span off a spell's own Duration field, or the card's resolved one where the plan carries it. */
async function spellSpan(actor, sys, plan = null, caster = null) {
  if (plan && Object.hasOwn(plan, "duration")) return castSpan(actor, plan.duration, caster ?? actor);
  const { effectDuration } = await import("../rules/spell-effects.mjs");
  const { spellTiming } = await import("./durations.mjs");
  return spellTiming(actor, effectDuration(sys?.duration ?? {}, { inFight: Boolean(actor?.activeFight?.()) })) ?? {};
}

/** The actor a uuid names, or null. */
function actorAt(uuid) {
  try {
    return uuid ? fromUuidSync(uuid) : null;
  } catch {
    return null;
  }
}

/** The Sovereign's prey mark as CORE keeps it, and whether a creature is that prey. */
async function preyFacts(actor) {
  const core = await import("./sovereign-core.mjs");
  return { mark: core.preyOf(actor), isPrey: target => core.isPrey(actor, target), core };
}

/** Heal the caster: here where this client owns it, else through the GM. */
async function healCaster(caster, n, { spell = "", messageId = null } = {}) {
  const amount = Math.max(0, Math.trunc(Number(n)) || 0);
  if (!caster || !amount) return 0;
  if (caster.isOwner) {
    const before = caster.system?.health?.value ?? 0;
    await caster.applyHealing?.(amount, { from: caster, givenBy: caster, spell: true, school: "death" });
    return Math.max(0, (caster.system?.health?.value ?? before) - before);
  }
  const done = await askGM({ act: "heal", casterUuid: caster.uuid, amount, spell, messageId });
  return Math.max(0, Number(done?.healed) || 0);
}

/* -------------------------------------------- */
/*  Judged before anything is paid               */
/* -------------------------------------------- */

/**
 * **A SOVEREIGN SPELL, JUDGED BEFORE THE BUDGET AND THE VITAE** (D-768's order). Null where it is refused
 * (said in words), else the plan and the card's rows.
 *
 * @param {{actor: Actor, spell: Item, list: object[], source?: object|null, answers?: object|null}} o
 * @returns {Promise<{plan: object|null, list: object[]}|null>}
 */
export async function judgeSovereignSpell({ actor, spell, list = [], source = null, answers = null } = {}) {
  const sys = spell?.system ?? {};
  if (!sovereignScope(sys, actor)) return { plan: null, list };
  const id = sys.identifier ?? "";
  const name = spell?.name ?? "";
  const plan = { card: { scope: true, test: sys.test?.resilience ?? null } };
  let rows = list;
  if (NO_APPLY.includes(id)) plan.noApply = true;

  // 07 §17's Mirror of Self: *When an attack hits you* - cast only as the Reaction a blow asks.
  if (readMirror(sys.effect)) {
    const no = mirrorRefusal({ asked: answers?.mirrorOfSelf === true, attack: true, reaction: true });
    if (no) return refuse(no, { spell: name });
    const { pastDeadline } = await import("../rules/necromancer-spells.mjs");
    if (pastDeadline(answers?.deadline ?? null, Date.now())) return refuse("mirrorLate", { spell: name });
    plan.mirror = readMirror(sys.effect);
  }

  // Embrace of the Vampyr: *One creature that is Stunned, Entangled or Prone*.
  const needs = readNeedsHeld(sys.target);
  if (needs) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    const no = heldTargetRefusal(needs, [...(who?.statuses ?? [])]);
    if (no) return refuse(no, { spell: name, name: rows[0]?.name ?? who?.name ?? "", conditions: needs.map(c => game.i18n.localize(AZEROTH.conditions?.[c] ?? c)).join(", ") });
  }

  // Tithe of the Many, Bloodbolt Ascension, the Crimson Tithe: every enemy in the ring round the caster.
  const selfRing = readSelfRing(sys.target);
  if (selfRing) {
    const own = casterToken(actor, source);
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    rows = await snapshotsOf(ringRows(await ringCandidates(actor, own, own), { feet: selfRing.feet, who: "enemy", except: own.id }).map(i => own.parent.tokens.get(i)).filter(Boolean));
    plan.card.ring = { feet: selfRing.feet };
  }

  // Edict of the Crown's *Each enemy in the area* and Crimson Cascade's *Each enemy in the line*: an ally the
  // caster targeted is spared (B.2: *every area hits enemies only*).
  if (/\bEach enemy in the (?:area|line|cone)\b/.test(String(sys.effect ?? "").replace(/<[^>]+>/g, " ")) && rows.length) {
    const own = casterToken(actor, source);
    const kept = [];
    for (const row of rows) {
      const who = await actorOfRow(row);
      if (who && (await relationOf(actor, own, who, tokenOfRow(row))) === "enemy") kept.push(row);
    }
    rows = kept;
  }

  // Twilight Bloodbolt: the one target, and every enemy within the splash round it.
  const splash = readSplash(sys.target);
  if (splash) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const target = tokenOfRow(rows[0]);
    const own = casterToken(actor, source);
    if (target) {
      const ids = ringRows(await ringCandidates(actor, own, target), { feet: splash.feet, who: "enemy", except: target.id });
      rows = [rows[0], ...(await snapshotsOf(ids.map(i => target.parent.tokens.get(i)).filter(Boolean)))];
    }
  }

  // Swarming Shadows: the area stands on the caster's prey, which must be on the board.
  const preyArea = readPreyArea(sys.target, sys.effect);
  if (preyArea) {
    const { mark, core } = await preyFacts(actor);
    const prey = mark ? actorAt(mark.actorUuid) : null;
    const token = mark?.tokenUuid ? actorAt(mark.tokenUuid) : (prey ? core.tokenOf(prey) : null);
    if (!prey) return refuse("noPrey", { name: actor.name, spell: name });
    if (!token) return refuse("preyUnplaced", { spell: name, name: prey.name });
    if (noGM([false])) return refuse("noGM", { spell: name });
    plan.preyArea = { ...preyArea, tokenUuid: token.uuid, sceneId: token.parent?.id ?? null, tokenId: token.id, name: token.name ?? prey.name };
    rows = await snapshotsOf([token]);
  }

  // Royal Approach: a space closer to the prey, picked before anything is paid.
  const approach = readApproach(sys.effect);
  if (approach) {
    const { mark, core } = await preyFacts(actor);
    const prey = mark ? actorAt(mark.actorUuid) : null;
    const preyToken = mark?.tokenUuid ? actorAt(mark.tokenUuid) : (prey ? core.tokenOf(prey) : null);
    const own = casterToken(actor, source);
    if (!prey) return refuse("noPrey", { name: actor.name, spell: name });
    if (!own || !preyToken || preyToken.parent?.id !== own.parent?.id) return refuse("preyUnplaced", { spell: name, name: prey.name });
    const picked = await pickApproach(actor, own, preyToken, approach, name);
    if (!picked) return null;
    plan.approach = { ...approach, ...picked };
  }

  // Taste of Lineage: a creature whose blood was spilled within the last day, at Touch.
  const taste = readTaste(sys.effect);
  if (taste) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    const age = readBloodAge(sys.target);
    const no = bloodAgeRefusal({ bledAt: who?.getFlag?.(SCOPE, BLED_AT_FLAG) ?? null, now: game.time?.worldTime ?? 0, seconds: age?.seconds });
    if (no) return refuse(no, { spell: name, name: rows[0]?.name ?? who?.name ?? "" });
    plan.taste = { uuid: who.uuid, name: rows[0]?.name ?? who.name };
  }

  // Gaze from the Throne: a creature whose blood the caster holds, spilled within the last month.
  const throne = readThroneGaze(sys.effect);
  if (throne) {
    const age = readBloodAge(sys.target);
    const held = heldBloodWithin(actor.getFlag?.(SCOPE, BLOOD_HELD_FLAG) ?? [], { now: game.time?.worldTime ?? 0, seconds: age?.seconds });
    const live = held.map(r => ({ row: r, actor: actorAt(r.uuid) })).filter(r => r.actor);
    if (!live.length) return refuse("noBloodHeld", { spell: name });
    const { chooseOption } = game.system.azeroth.workflows;
    const pick = await chooseOption(spell, live.map(r => ({ key: r.row.uuid, name: r.actor.name, description: "" })), null, { prompt: t("AZEROTH.SovSpell.Throne.Prompt", { spell: name }) });
    if (!pick) return null;
    const who = actorAt(pick.key);
    const token = (await preyFacts(actor)).core.tokenOf(who);
    if (noGM([who?.isOwner === true])) return refuse("noGM", { spell: name });
    plan.card.throne = { uuid: who.uuid, tokenUuid: token?.uuid ?? null, sceneId: token?.parent?.id ?? null, tokenId: token?.id ?? null, name: token?.name ?? who.name, feet: throne.feet };
    rows = token ? await snapshotsOf([token]) : [{ actorId: who.id, name: who.name, sceneId: null, tokenId: null }];
  }

  // Royal Herald: a creature named and a message of up to 25 words, asked before anything is paid.
  const herald = readHerald(sys.effect);
  if (herald) {
    const to = await namedCreature(spell, t("AZEROTH.SovSpell.Herald.Prompt", { spell: name }), { exclude: [actor.id] });
    if (!to) return null;
    const text = await askWords(spell, t("AZEROTH.SovSpell.Herald.Message", { n: herald.words }));
    if (text === null) return null;
    plan.herald = { ...herald, to: to.uuid, toName: to.name, message: limitWords(text, herald.words) };
  }

  // Royal Command: the one spoken command of up to ten words, asked before anything is paid; whether it
  // harms the creature or its allies is the GM's to say (the plan's C.4).
  const command = readCommand(sys.effect);
  if (command) {
    const words = await askWords(spell, t("AZEROTH.SovSpell.Command.Words", { n: command.words }));
    if (words === null) return null;
    plan.card.command = limitWords(words, command.words);
  }

  // Oath of Fealty: two willing creatures (the caster may be one), and the oath's words.
  if (readOath(sys.effect)) {
    if (rows.length !== 2) return refuse("twoTargets", { spell: name });
    const who = await Promise.all(rows.map(actorOfRow));
    if (who.some(a => !a)) return refuse("oneTarget", { spell: name });
    if (noGM(who.map(a => a.isOwner === true))) return refuse("noGM", { spell: name });
    const words = await askWords(spell, t("AZEROTH.SovSpell.Oath.Words"), { max: 400 });
    if (words === null) return null;
    plan.oath = { targets: who.map((a, i) => ({ uuid: a.uuid, name: rows[i]?.name ?? a.name })), words: String(words).slice(0, 400) };
  }

  // Royal Seal: a door on the board, or an item or journal entry the caster names.
  if (readSeal(sys.effect)) {
    const sealed = await pickSealed(actor, spell, source);
    if (!sealed) return null;
    if (noGM([sealed.owned === true])) return refuse("noGM", { spell: name });
    plan.seal = sealed;
  }

  // Eyes of the Swarm: the swarm rises beside the caster's token.
  const swarmEyes = readSwarmEyes(sys.effect);
  if (swarmEyes) {
    const own = casterToken(actor, source);
    if (!own) return refuse("noToken", { name: actor.name, spell: name });
    if (noGM([false])) return refuse("noGM", { spell: name });
    plan.swarmEyes = { ...swarmEyes, sceneId: own.parent.id, x: own.x, y: own.y };
  }

  // Mesmerize: *One living Humanoid that can see you* - the kind and the life judged here; the sight is the table's.
  const livingKind = readLivingKind(sys.target);
  if (livingKind) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    const { creatureSnapshot, kindsOf } = await import("../rules/creature-kinds.mjs");
    const no = who ? livingKindRefusal(livingKind, { type: who.type, creatureType: who.system?.creatureType ?? null, kinds: [...kindsOf(creatureSnapshot(who))] }) : "oneTarget";
    if (no) return refuse(no, { spell: name, name: rows[0]?.name ?? who?.name ?? "", kind: game.i18n.localize(AZEROTH.creatureTypes?.[livingKind.kind] ?? livingKind.kind) });
  }

  // Shroud of Sorrow: the area round the caster moves with the caster, so the card places none.
  if (readCarriedArea(sys.target, sys.effect)) plan.carried = true;

  // Sanguine Draught: one creature, with blood, not fed on today (The Blood Royal's limits), judged now; whether it is
  // Bleeding is judged when the spell takes effect (*the spell does nothing and the Vitae is spent*).
  const draught = readDraught(sys.effect);
  if (draught) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    if (!who) return refuse("oneTarget", { spell: name });
    const core = await import("./sovereign-core.mjs");
    const verdict = core.feedVerdict(actor, who, { mode: "out", free: true });
    if (verdict.refusal) {
      const { FEED_REFUSAL_WORDS } = await import("../rules/feeding.mjs");
      ui.notifications?.warn(game.i18n.format(FEED_REFUSAL_WORDS[verdict.refusal] ?? FEED_REFUSAL_WORDS.noTarget, { name: actor.name, target: who.name }));
      return null;
    }
    if (noGM([who.isOwner === true])) return refuse("noGM", { spell: name });
    plan.draught = { uuid: who.uuid, name: rows[0]?.name ?? who.name };
  }

  // Blood Bond: one creature fed on three different days, judged now. *Willing or Charmed* is the range door's
  // (`rules/target-line.mjs#judgeNamed`, D-1373): an ally, a neutral creature or a Charmed one passed it before this.
  const bond = readBond(sys.target);
  if (bond) {
    if (rows.length !== 1) return refuse("oneTarget", { spell: name });
    const who = await actorOfRow(rows[0]);
    if (!who) return refuse("oneTarget", { spell: name });
    const days = feedDaysOf(actor.getFlag?.(SCOPE, FEED_DAYS_FLAG) ?? {}, who.uuid);
    const no = bondRefusal({ days, need: bond.days, charmed: who.statuses?.has?.("charmed") === true, willing: true });
    if (no) return refuse(no, { spell: name, name: rows[0]?.name ?? who.name, n: days, need: bond.days });
    if (noGM([who.isOwner === true])) return refuse("noGM", { spell: name });
    plan.bond = { uuid: who.uuid, name: rows[0]?.name ?? who.name };
  }

  // A failure laid on a creature this client does not own lands on its own Resist client; a GM is
  // needed only where this caster writes on another's creature at the Apply (the hit Bleeding, the
  // feeding) or the after-cast (the area) - asked here, before the Vitae.
  if (readHitBleed(sys.effect, { test: sys.test?.resilience ?? null }) || readFeedsOn(sys.effect)) {
    const owned = await Promise.all(rows.map(async row => (await actorOfRow(row))?.isOwner === true));
    if (noGM(owned)) return refuse("noGM", { spell: name });
  }
  return { plan, list: rows };
}

/** A world actor named through the one chooser (Royal Herald). */
async function namedCreature(item, prompt, { exclude = [] } = {}) {
  const { chooseOption } = game.system.azeroth.workflows;
  const skip = new Set(exclude);
  const options = (game.actors?.contents ?? []).filter(a => !skip.has(a.id) && (a.type === "character" || a.type === "npc"))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(a => ({ key: a.id, name: a.name, description: "" }));
  if (!options.length) return null;
  const pick = await chooseOption(item, options, null, { prompt });
  return pick ? game.actors.get(pick.key) ?? null : null;
}

/** A line of words asked in a dialog before anything is paid; null where dismissed. */
async function askWords(spell, label, { max = 400 } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const answer = await DialogV2.prompt({
    id: `azeroth-sov-words-${foundry.utils.randomID(6)}`,
    classes: ["azeroth", "azeroth-roll-dialog"],
    window: { title: spell.name },
    content: `<label>${foundry.utils.escapeHTML(label)}<input type="text" name="words" maxlength="${max}"></label>`,
    ok: { label: game.i18n.localize("AZEROTH.SovSpell.Words.Ok"), callback: (event, button) => button.form.elements.words.value },
    rejectClose: false
  });
  return typeof answer === "string" ? answer : null;
}

/** Royal Approach's space: a pick on the board within the feet, judged closer to the prey. */
async function pickApproach(actor, own, preyToken, approach, name) {
  const { pickPoint } = await import("../canvas/place.mjs");
  const { feetApart, feetToPoint } = await import("../canvas/footprints.mjs");
  const before = feetApart(own, preyToken) ?? Infinity;
  let words = null;
  const point = await pickPoint({
    hint: t("AZEROTH.SovSpell.Approach.Hint", { feet: approach.feet, name: preyToken.name ?? "" }),
    sceneId: own.parent.id,
    accept: p => {
      const moved = feetToPoint(own, p);
      const grid = own.parent.grid?.size ?? 100;
      const probe = { parent: own.parent, x: p.x - (own.width * grid) / 2, y: p.y - (own.height * grid) / 2, width: own.width, height: own.height, elevation: own.elevation ?? 0 };
      const after = feetApart(probe, preyToken);
      const no = approachRefusal({ prey: true, moved: moved ?? Infinity, feet: approach.feet, before, after: after ?? Infinity });
      if (!no) return true;
      words = t(`AZEROTH.SovSpell.Refuse.${no}`, { spell: name, feet: approach.feet, name: preyToken.name ?? "" });
      ui.notifications?.warn(words);
      return false;
    }
  });
  if (!point) return null;
  const grid = own.parent.grid?.size ?? 100;
  return { sceneId: own.parent.id, tokenId: own.id, x: Math.round(point.x - (own.width * grid) / 2), y: Math.round(point.y - (own.height * grid) / 2) };
}

/** Royal Seal's target: a door wall within reach of the caster, else an item or a journal entry named. */
async function pickSealed(actor, spell, source) {
  const own = casterToken(actor, source);
  const { chooseOption } = game.system.azeroth.workflows;
  const options = [];
  if (own) {
    const scene = own.parent;
    const grid = scene.grid?.size ?? 100;
    const cx = own.x + (own.width * grid) / 2;
    const cy = own.y + (own.height * grid) / 2;
    const reach = (scene.grid?.size ?? 100) * 2;
    for (const w of scene.walls ?? []) {
      if (!w.door) continue;
      const [x1, y1, x2, y2] = w.c ?? [];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      if (Math.hypot(mx - cx, my - cy) > reach) continue;
      options.push({ key: `wall:${w.uuid}`, name: t("AZEROTH.SovSpell.Seal.Door"), description: "" });
    }
  }
  for (const i of (actor.items ?? []).filter(i => i.type === "gear").sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    options.push({ key: `item:${i.uuid}`, name: i.name, description: "" });
  }
  for (const j of (game.journal?.contents ?? []).filter(j => j.isOwner).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))) {
    options.push({ key: `journal:${j.uuid}`, name: j.name, description: "" });
  }
  if (!options.length) return refuse("noSealTarget", { spell: spell.name });
  const pick = await chooseOption(spell, options, null, { prompt: t("AZEROTH.SovSpell.Seal.Prompt", { spell: spell.name }) });
  if (!pick) return null;
  const [kind, uuid] = String(pick.key).split(/:(.+)/);
  const doc = actorAt(uuid);
  return { kind, uuid, name: pick.name, owned: kind === "wall" ? isGM() : doc?.isOwner === true };
}

/* -------------------------------------------- */
/*  The card's rows                              */
/* -------------------------------------------- */

/**
 * **THE ROWS THE CARD DRAWS** (after the cast's own damage and heal were worked out): Bloodbolt's heal
 * is the caster's, and only where the target is its prey (07 §17: *If the target is your prey, you
 * regain 3 Health*). Arrays are changed in place; answers the heal the card carries.
 */
export async function sovereignCardRows({ actor, spell, list = [], healByTarget = [], heal = null, success = false } = {}) {
  const sys = spell?.system ?? {};
  if (!success || !sovereignScope(sys, actor)) return heal;
  // **A HEAL THE DOOR LANDS IS NO APPLY** (D-1371): Tithe of the Many's and the Crimson Tithe's *for each enemy that
  // fails* (the Resist door's) and Shroud of Sorrow's *for each enemy that takes damage* (the tick's) were read by the
  // parser as a heal the card offered its targets - enemies - at the cast.
  if (readFailHeal(sys.effect) || readTickDrain(sys.effect)) {
    healByTarget.length = 0;
    return null;
  }
  const preyHeal = readPreyHeal(sys.effect);
  if (preyHeal) {
    healByTarget.length = 0;
    const { isPrey } = await preyFacts(actor);
    const onPrey = list[0] ? isPrey(list[0]) : false;
    return onPrey ? { amount: preyHeal.amount, self: true, explanation: t("AZEROTH.SovSpell.PreyHeal", { n: preyHeal.amount }) } : null;
  }
  return heal;
}

/* -------------------------------------------- */
/*  Once the cast went off                       */
/* -------------------------------------------- */

/**
 * **WHAT THE CAST DOES ONCE ITS TEST SUCCEEDED** (07 §8: a failed cast spends its Vitae and does nothing).
 * Answers the card's lines.
 */
export async function sovereignSpellAfterCast({ actor, spell, plan = null, list = [], spellDC = null, cast = null, source = null } = {}) {
  const sys = spell?.system ?? {};
  if (!plan || !sovereignScope(sys, actor)) return [];
  const lines = [];
  const name = spell.name;
  // Bloodbolt Ascension: a flying Speed of 30 feet until the start of the caster's next turn.
  // And Hour of the Court's *For the duration, you have a flying Speed of 15 feet*, with its Sanguine Shield (D-1361).
  const flight = readFlight(sys.effect);
  if (flight) {
    const { untilNextTurnOrRound } = await import("./durations.mjs");
    const span = flight.until === "duration" ? await spellSpan(actor, sys, plan, actor) : (untilNextTurnOrRound(actor) ?? {});
    const laid = await layOwnEffect(actor, spell, { span, changes: [{ key: "system.flyingSpeed", type: "override", value: String(flight.feet), phase: "initial" }], data: { flight: { feet: flight.feet } } });
    if (laid) lines.push(t(flight.until === "duration" ? "AZEROTH.SovSpell.Flight.LaidDuration" : "AZEROTH.SovSpell.Flight.Laid", { name: actor.name, spell: name, n: flight.feet }));
    // *You gain a Sanguine Shield: temporary Health equal to 12 plus your Constitution modifier. It lasts for the
    // duration* - the caster's alone, ended with the effect that carries the flight (05's one door; D-777).
    const shield = readShield(sys.effect);
    if (shield && laid) {
      const n = plusConAmount(shield, actor.system?.abilities?.con?.mod ?? 0);
      const done = n > 0 ? await actor.grantTemporaryHealth?.(n, { source: name, span: "effect", effectId: laid.id }) : null;
      if (done?.landed) lines.push(t("AZEROTH.SovSpell.Shield.Granted", { name: actor.name, n: done.temp, spell: name }));
    }
  }
  // Mantle of Majesty: *you cannot be Slowed or Entangled* for the duration (its temporary Health is the Apply's); and
  // Crimson Carapace's *you cannot become Bleeding*, laid on the one effect that carries its Armor Points (D-1362).
  const refused = readRefusedConditions(sys.effect);
  if (refused) {
    const changes = NO_APPLY.includes(sys.identifier) ? appliedChanges(sys) : [];
    lines.push(...await layOwn(actor, spell, { span: await spellSpan(actor, sys, plan, actor), changes, extra: { [IMMUNE_FLAG]: { conditions: refused, source: name } }, text: changes.length ? "AZEROTH.SovSpell.Carapace.Laid" : "AZEROTH.SovSpell.Refuses.Laid", words: { conditions: refused.map(c => game.i18n.localize(AZEROTH.conditions?.[c] ?? c)).join(", "), n: Number(changes[0]?.value) || 0 } }));
  }
  // Sanguine Barrier: each weapon attack that hits the caster deals half its Constitution modifier less, at least 1.
  const weaponLess = readWeaponLess(sys.effect);
  if (weaponLess) {
    const n = halfModifier(actor.system?.abilities?.con?.mod ?? 0, weaponLess.min);
    lines.push(...await layOwn(actor, spell, { span: await spellSpan(actor, sys, plan, actor), extra: { [WEAPON_LESS_FLAG]: { amount: n, source: name } }, text: "AZEROTH.SovSpell.Barrier.Laid", words: { n } }));
  }
  // Veil of Mist: a Bane on every weapon attack at the caster, no weapon or claw attack of its own, until its next turn.
  const veil = readVeil(sys.effect);
  if (veil) {
    // *Until the start of your next turn*, which 07's Duration reader names no span for (D-1364): the caster's next turn,
    // or a round of the world's clock out of a fight.
    const { untilNextTurnOrRound } = await import("./durations.mjs");
    lines.push(...await layOwn(actor, spell, { span: untilNextTurnOrRound(actor) ?? {}, extra: { [VEIL_FLAG]: { banes: veil.banes, noWeapon: veil.noWeapon, through: veil.through, source: name } }, text: "AZEROTH.SovSpell.Veil.Laid" }));
  }
  // Scent of Blood: where each Bleeding creature within 60 feet is, and a Boon on the next Attack Test at one of them.
  const scent = readScent(sys.effect);
  if (scent) lines.push(...await scentLands(actor, spell, scent, { plan, source }));
  if (plan.draught) lines.push(...await draughtLands(actor, spell, plan.draught));
  if (plan.bond) lines.push(...await bondLands(actor, spell, plan.bond));
  // Air of Majesty, Read the Supplicant: a Boon on the named skills for the duration.
  const boon = readSkillBoon(sys.effect);
  if (boon) {
    lines.push(...await layOwn(actor, spell, { span: await spellSpan(actor, sys, plan, actor), extra: { [SKILL_BOON_FLAG]: { skills: boon.skills, against: boon.against, source: name } }, text: "AZEROTH.SovSpell.SkillBoon.Laid", words: { skills: boon.skills.map(s => game.i18n.localize(AZEROTH.skills?.[s] ?? s)).join(", ") } }));
  }
  // Majesty Unbound: the extra Shadow on the prey and the once-a-turn heal, read by the blow.
  const majesty = readMajesty(sys.effect);
  if (majesty) lines.push(...await layOwn(actor, spell, { span: await spellSpan(actor, sys, plan, actor), extra: { [MAJESTY_FLAG]: { ...majesty, source: name } }, text: "AZEROTH.SovSpell.Majesty.Laid" }));
  // Unfading Glory: the hold at 1 for a Tribute, and a Boon on every Test, for the hour.
  const glory = readUnfading(sys.effect);
  if (glory) {
    const span = await spellSpan(actor, sys, plan, actor);
    lines.push(...await layOwn(actor, spell, { span, extra: { [UNFADING_FLAG]: { tribute: glory.tribute, stay: glory.stay, source: name }, ...(glory.boon ? { laidBoon: { kind: "all", boons: 1, source: name, lasting: true } } : {}) }, text: "AZEROTH.SovSpell.Unfading.Laid" }));
  }
  if (plan.approach) lines.push(...await approachLands(actor, spell, plan.approach));
  if (plan.taste) lines.push(...await tasteLands(actor, spell, plan.taste));
  if (plan.seal) lines.push(...await sealLands(actor, spell, plan.seal));
  if (plan.preyArea) lines.push(...await swarmLands(actor, spell, plan.preyArea, { cast, spellDC }));
  if (plan.herald) lines.push(...await heraldLands(actor, spell, plan.herald));
  if (plan.oath) lines.push(...await oathLands(actor, spell, plan.oath, plan));
  if (plan.swarmEyes) lines.push(...await swarmEyesLands(actor, spell, plan.swarmEyes, plan));
  if (plan.mirror) lines.push(...await mirrorLands(actor, spell, plan.mirror));
  return lines;
}

/** A self effect the cast lays on the caster: its span, its changes and its flags. */
async function layOwn(actor, spell, { span = {}, changes = [], data = null, extra = {}, text = null, words = {} } = {}) {
  const laid = await layOwnEffect(actor, spell, { span, changes, data, extra });
  return laid && text ? [t(text, { name: actor.name, spell: spell.name, ...words })] : [];
}

/** The self effect itself (one a spell: a recast replaces it), or null. */
async function layOwnEffect(actor, spell, { span = {}, changes = [], data = null, extra = {} } = {}) {
  const sys = spell.system ?? {};
  const prior = (actor.effects ?? []).filter(e => e.flags?.[SCOPE]?.sovereignOwn === sys.identifier).map(e => e.id);
  if (prior.length) await actor.deleteEmbeddedDocuments("ActiveEffect", prior);
  const [laid] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: sys.effect ?? "", ...span,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    system: { changes },
    flags: { [SCOPE]: { sovereignOwn: sys.identifier ?? null, identifier: sys.identifier ?? null, ...(data ? { sovereignData: data } : {}), ...extra } }
  }]);
  return laid ?? null;
}

/** A spell's own stated changes (Crimson Carapace's Armor Points) as a self effect carries them: `final`, as the Apply lays them. */
function appliedChanges(sys = {}) {
  return (sys.applies?.changes ?? []).filter(c => c?.key).map(c => ({ key: c.key, type: c.type ?? "add", value: String(c.value ?? ""), phase: "final" }));
}

/**
 * **SCENT OF BLOOD** (07 §17: *you know where each **Bleeding** creature within 60 feet of you is, through walls and
 * darkness. You have a Boon on your next Attack Test this turn against one of them*; D-1370): the caster's own
 * effect for the turn, a card to the caster's owners naming each creature found and how far, a ping on each that
 * only this client draws, and the Boon promised to the next Attack Test at a Bleeding creature
 * (`next-attack.mjs`, held to the target's condition).
 */
async function scentLands(actor, spell, scent, { plan = null, source = null } = {}) {
  const lines = [];
  await layOwnEffect(actor, spell, { span: await spellSpan(actor, spell.system, plan, actor) });
  const own = casterToken(actor, source);
  const found = [];
  if (own) {
    const { feetApart } = await import("../canvas/footprints.mjs");
    const rows = [];
    for (const tk of own.parent.tokens ?? []) {
      if (!tk.actor || tk.id === own.id) continue;
      rows.push({ id: tk.id, feet: feetApart(own, tk), statuses: [...(tk.actor.statuses ?? [])], down: isDown(tk) });
    }
    for (const row of scentRows(rows, { feet: scent.feet, status: scent.status, except: own.id })) {
      const tk = own.parent.tokens.get(row.id);
      found.push({ name: tk.hidden && !isGM() ? t("AZEROTH.SovSpell.Scent.Unseen") : (tk.name ?? tk.actor.name), feet: row.feet });
      // The ping is this client's alone (`ControlsLayer#handlePing`), never broadcast: the knowing is the caster's.
      if (canvas?.scene?.id === own.parent.id && canvas.controls?.handlePing) {
        const grid = own.parent.grid?.size ?? 100;
        try {
          canvas.controls.handlePing(game.user, { x: tk.x + (tk.width * grid) / 2, y: tk.y + (tk.height * grid) / 2 }, { scene: own.parent.id, style: CONFIG.Canvas.pings.types.PULSE, zoom: canvas.stage?.scale?.x ?? 1 });
        } catch (err) {
          console.warn("azeroth-rpg | Scent of Blood's ping", err);
        }
      }
    }
  }
  const words = found.length ? found.map(f => t("AZEROTH.SovSpell.Scent.Row", { name: f.name, feet: f.feet })) : [t(own ? "AZEROTH.SovSpell.Scent.None" : "AZEROTH.SovSpell.Scent.NoToken", { name: actor.name, feet: scent.feet })];
  await whisperCard(actor, spell.name, words);
  lines.push(t("AZEROTH.SovSpell.Scent.Laid", { name: actor.name, n: found.length, feet: scent.feet }));
  if (scent.boons > 0) {
    const { layNextAttack } = await import("./next-attack.mjs");
    const laid = await layNextAttack(actor, [{ source: spell.system?.identifier ?? "scent-of-blood", name: spell.name, boons: scent.boons, lasts: "turn", targetStatus: scent.status }]);
    if (laid.length) lines.push(t("AZEROTH.SovSpell.Scent.Boon", { name: actor.name }));
  }
  return lines;
}

/**
 * **SANGUINE DRAUGHT** (07 §17: *If the target is not **Bleeding** when the spell takes effect, the spell does nothing
 * and the Vitae is spent. The target loses Health equal to your tier. You feed on it (The Blood Royal), making no
 * Test*; D-1372): the feeding through CORE's one door (`feedOn`, a free feeding at the spell's range that asks no
 * reach and no Test, its Vitae `feed`), then the Health, here where this client owns the creature or on the GM's.
 */
async function draughtLands(actor, spell, draught) {
  const who = actorAt(draught.uuid);
  if (!who) return [];
  if (who.statuses?.has?.("bleeding") !== true) return [t("AZEROTH.SovSpell.Draught.NotBleeding", { name: draught.name, spell: spell.name })];
  const core = await import("./sovereign-core.mjs");
  const fed = await core.feedOn(actor, who, { mode: "out", free: true, budget: false, source: spell.name, atRange: true });
  if (!fed?.ok) return [t("AZEROTH.SovSpell.Feed.Not", { name: actor.name, target: draught.name, reason: fed?.reason ?? "" })];
  const lines = [t("AZEROTH.SovSpell.Draught.Fed", { name: actor.name, target: draught.name })];
  try {
    const done = await draughtLoss(actor, who);
    if (done?.ok === false) ui.notifications?.warn(done.words ?? "");
    else lines.push(t("AZEROTH.SovSpell.Draught.Lost", { name: draught.name, n: done?.loss ?? 0 }));
  } catch (err) {
    ui.notifications?.warn(err.message);
  }
  return lines;
}

/**
 * Sanguine Draught's Health lost, here where the GM is this client, else on the GM's: judged there off the world
 * (`rules/sovereign-asks.mjs#draughtClaim`) - the caster fed on the creature within the minute, the creature still
 * Bleeding, once for that feeding - and the amount the caster's tier, never the payload's.
 */
async function draughtLoss(actor, who) {
  return askGM({ act: "draught", casterUuid: actor.uuid, targetUuid: who.uuid });
}

/**
 * **BLOOD BOND** (07 §17: *The target is **Charmed** by you for the duration. You may end the bond at any time. The GM
 * decides how long the bond holds and what the target will and will not do for you*; D-1373): a Charmed effect of its
 * own with no duration, carrying the bond - never merged into a Charmed the creature already wears, which a *willing or
 * Charmed* target often does and whose own span would end the bond - laid here where this client owns the creature and
 * through the GM's judged `effect` act otherwise, and an *End the bond* press for the caster.
 */
async function bondLands(actor, spell, bond) {
  const who = actorAt(bond.uuid);
  if (!who) return [];
  const prior = (who.effects ?? []).filter(e => e.flags?.[SCOPE]?.[BOND_FLAG]?.by === actor.uuid).map(e => e.id);
  const data = {
    name: spell.name, img: spell.img, origin: actor.uuid, statuses: ["charmed"],
    description: `<p>${t("AZEROTH.SovSpell.Bond.Landed", { name: bond.name, caster: actor.name })}</p>`,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
    flags: { [SCOPE]: { [BOND_FLAG]: { by: actor.uuid, source: spell.name } } }
  };
  let effectId = null;
  try {
    if (who.isOwner) {
      if (prior.length) await who.deleteEmbeddedDocuments("ActiveEffect", prior);
      const [made] = await who.createEmbeddedDocuments("ActiveEffect", [data]);
      effectId = made?.id ?? null;
    } else {
      if (prior.length) await askGM({ act: "endEffects", targetUuid: who.uuid, ids: prior, casterUuid: actor.uuid });
      effectId = (await askGM({ act: "effect", targetUuid: who.uuid, data, casterUuid: actor.uuid }))?.effectId ?? null;
    }
  } catch (err) {
    ui.notifications?.warn(err.message);
  }
  if (!effectId) return [t("AZEROTH.SovSpell.Bond.NotLaid", { name: bond.name })];
  const effect = { id: effectId };
  await whisperCard(actor, spell.name, [t("AZEROTH.SovSpell.Bond.Laid", { name: bond.name, caster: actor.name })],
    { presses: [{ press: "bondEnd", label: game.i18n.localize("AZEROTH.SovSpell.Bond.End") }], flags: { sovereignCard: { press: "bondEnd", casterUuid: actor.uuid, targetUuid: who.uuid, effectId: effect?.id ?? null, spell: spell.name } } });
  return [t("AZEROTH.SovSpell.Bond.Landed", { name: bond.name, caster: actor.name })];
}

/** Mirror of Self: the temporary Health before the blow's damage, until the end of the fight. */
async function mirrorLands(actor, spell, read) {
  const done = await actor.grantTemporaryHealth?.(read.amount, { source: spell.name, span: read.span ?? "encounter" });
  return done?.landed ? [t("AZEROTH.SovSpell.Mirror.Granted", { name: actor.name, n: read.amount })] : [];
}

/** Royal Approach: the caster's token displaced to the space picked, no Opportunity Attack. */
async function approachLands(actor, spell, approach) {
  const scene = game.scenes?.get(approach.sceneId) ?? null;
  const token = scene?.tokens?.get(approach.tokenId) ?? null;
  if (!token) return [t("AZEROTH.SovSpell.Approach.NoToken", { name: actor.name })];
  // A displacement (`action: "displace"`) meters nothing and offers no Opportunity Attack (D-769's move).
  const moved = await token.move({ x: approach.x, y: approach.y, action: "displace" });
  if (moved === false) return [t("AZEROTH.SovSpell.Approach.NoToken", { name: actor.name })];
  return [t("AZEROTH.SovSpell.Approach.Moved", { name: actor.name, feet: approach.feet })];
}

/** Taste of Lineage: the people or kind, living or undead, to the caster; the blood is now held. */
async function tasteLands(actor, spell, taste) {
  const who = actorAt(taste.uuid);
  if (!who) return [];
  const { creatureSnapshot, kindsOf } = await import("../rules/creature-kinds.mjs");
  const kinds = kindsOf(creatureSnapshot(who));
  // `kindsOf` answers a Set (ANIM: `.includes` threw here and Taste of Lineage posted no card).
  const undead = kinds.has("undead") || who.system?.undead === true;
  const people = who.type === "character"
    ? (who.items?.find?.(i => i.type === "race")?.name ?? game.i18n.localize("AZEROTH.SovSpell.Taste.Unknown"))
    : (game.i18n.localize(AZEROTH.creatureTypes?.[who.system?.creatureType] ?? who.system?.creatureType ?? "") || game.i18n.localize("AZEROTH.SovSpell.Taste.Unknown"));
  await rememberBlood(actor, who);
  const lines = [
    t("AZEROTH.SovSpell.Taste.People", { name: taste.name, people }),
    t(undead ? "AZEROTH.SovSpell.Taste.Undead" : "AZEROTH.SovSpell.Taste.Living", { name: taste.name }),
    t("AZEROTH.SovSpell.Taste.Noble", { name: taste.name })
  ];
  await whisperCard(actor, spell.name, lines);
  return [t("AZEROTH.SovSpell.Taste.Done", { name: actor.name, target: taste.name })];
}

/**
 * **THE BLOOD THE SOVEREIGN HOLDS, REMEMBERED** (D-1246): the creature's row on the Sovereign's own
 * record, written where this client owns the Sovereign (a claw hit's attacker client, the caster's).
 */
export async function rememberBlood(sovereign, creature) {
  if (!sovereign?.isOwner || !creature?.uuid || creature.uuid === sovereign.uuid) return false;
  const next = addHeldBlood(sovereign.getFlag(SCOPE, BLOOD_HELD_FLAG) ?? [], { uuid: creature.uuid, name: creature.name ?? "", at: game.time?.worldTime ?? 0 });
  await sovereign.setFlag(SCOPE, BLOOD_HELD_FLAG, next);
  return true;
}

/** A claw hit's payload (`CLAW_HIT_HOOK`): the creature hit is blood the Sovereign now holds. */
async function rememberClawBlood(payload = {}) {
  const sovereign = actorAt(payload.attackerUuid);
  if (!sovereign?.isOwner) return;
  // Only a Sovereign who knows a spell that reads held blood keeps the record (no writes for anyone else).
  if (!(sovereign.items ?? []).some(i => i.type === "spell" && readThroneGaze(i.system?.effect ?? ""))) return;
  const token = actorAt(payload.targetTokenUuid);
  const creature = token?.actor ?? actorAt(payload.targetActorUuid);
  if (creature) await rememberBlood(sovereign, creature);
}

/** Royal Seal: the seal on the door, the item or the journal entry, for the day. */
async function sealLands(actor, spell, seal) {
  const until = (game.time?.worldTime ?? 0) + 86400;
  const record = { by: actor.uuid, name: actor.name, spell: spell.name, until };
  if (seal.kind === "wall" || !actorAt(seal.uuid)?.isOwner) await askGM({ act: "seal", casterUuid: actor.uuid, uuid: seal.uuid, record });
  else await actorAt(seal.uuid).setFlag(SCOPE, SEAL_FLAG, record);
  return [t("AZEROTH.SovSpell.Seal.Laid", { name: actor.name, target: seal.name })];
}

/** Report an opened seal to its caster, at any distance (the caster's owners, by whisper). */
async function reportSeal(doc, record, what) {
  if (!record?.by || (Number(record.until) || 0) < (game.time?.worldTime ?? 0)) return;
  const caster = actorAt(record.by);
  if (!caster) return;
  await whisperCard(caster, record.spell ?? "", [t("AZEROTH.SovSpell.Seal.Opened", { target: what })]);
}

/** A sealed door opened (the active GM's `updateWall`). */
async function sealOnWall(wall, change) {
  if (!game.users?.activeGM?.isSelf) return;
  const record = wall?.flags?.[SCOPE]?.[SEAL_FLAG] ?? null;
  if (!record || !("ds" in (change ?? {}))) return;
  const OPEN = CONST.WALL_DOOR_STATES?.OPEN ?? 1;
  // A write that changes nothing is never sent, so a door's state arriving as open was closed before.
  if (!sealOpened({ kind: "wall", before: -1, after: change.ds, OPEN })) return;
  await reportSeal(wall, record, t("AZEROTH.SovSpell.Seal.Door"));
}

/** A sealed item or journal entry opened by anyone but its caster's owners (a sheet rendered). */
async function sealOnSheet(app) {
  const doc = app?.document ?? null;
  const record = doc?.flags?.[SCOPE]?.[SEAL_FLAG] ?? null;
  if (!record) return;
  const caster = actorAt(record.by);
  if (caster?.isOwner) return;
  if (!sealOpened({ kind: "sheet" })) return;
  if (game.users?.activeGM?.isSelf) await reportSeal(doc, record, doc.name);
  else await game.users?.activeGM?.query?.(SOVEREIGN_SPELL_QUERY, { act: "sealReport", uuid: doc.uuid }, { timeout: 15000 }).catch(() => null);
}

/** Royal Herald: the message to the creature named, with the caster's titles. */
async function heraldLands(actor, spell, herald) {
  const to = actorAt(herald.to);
  if (!to) return [];
  await whisperCard(to, spell.name, [t("AZEROTH.SovSpell.Herald.Delivered", { from: actor.name, message: foundry.utils.escapeHTML(herald.message) })]);
  return [t("AZEROTH.SovSpell.Herald.Sent", { name: actor.name, to: herald.toName })];
}

/** Oath of Fealty: the oath on each target for the duration, and a *Broken* press on its card. */
async function oathLands(actor, spell, oath, plan) {
  const oathId = foundry.utils.randomID(8);
  for (const row of oath.targets) {
    const who = actorAt(row.uuid);
    if (!who) continue;
    const span = await spellSpan(who, spell.system, plan, actor);
    const data = {
      name: spell.name, img: spell.img, origin: actor.uuid, description: `<p>${foundry.utils.escapeHTML(oath.words)}</p>`, ...span,
      flags: { [SCOPE]: { [OATH_FLAG]: { by: actor.uuid, oathId, words: oath.words } } }
    };
    if (who.isOwner) await who.createEmbeddedDocuments("ActiveEffect", [data]);
    else await askGM({ act: "effect", targetUuid: who.uuid, data, casterUuid: actor.uuid });
  }
  for (const row of oath.targets) {
    const who = actorAt(row.uuid);
    if (who) await whisperCard(who, spell.name, [t("AZEROTH.SovSpell.Oath.Sworn", { name: row.name, words: foundry.utils.escapeHTML(oath.words) })],
      { presses: [{ press: "oathBroken", label: game.i18n.localize("AZEROTH.SovSpell.Oath.Break") }], flags: { sovereignCard: { press: "oathBroken", casterUuid: actor.uuid, oathId, who: row.uuid, spell: spell.name } }, audience: who.uuid });
  }
  return [t("AZEROTH.SovSpell.Oath.Laid", { name: actor.name, names: oath.targets.map(r => r.name).join(", ") })];
}

/** Eyes of the Swarm: the bat swarm's token beside the caster, for the hour, and a *Look* press. */
async function swarmEyesLands(actor, spell, eyes, plan) {
  const made = await askGM({ act: "swarm", casterUuid: actor.uuid, sceneId: eyes.sceneId, x: eyes.x, y: eyes.y, name: spell.name, img: spell.img });
  const span = await spellSpan(actor, spell.system, plan, actor);
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: spell.name, img: spell.img, origin: actor.uuid, description: spell.system?.effect ?? "", ...span,
    flags: { [SCOPE]: { [LOOK_FLAG]: { kind: "swarm", sceneId: eyes.sceneId, tokenId: made?.tokenId ?? null, miles: eyes.miles } } }
  }]);
  await whisperCard(actor, spell.name, [t("AZEROTH.SovSpell.Swarm.Risen", { name: actor.name, miles: eyes.miles })],
    { presses: [{ press: "look", label: game.i18n.localize("AZEROTH.SovSpell.Swarm.Look") }], flags: { sovereignCard: { press: "look", casterUuid: actor.uuid, sceneId: eyes.sceneId, tokenId: made?.tokenId ?? null, name: spell.name } } });
  return [t("AZEROTH.SovSpell.Swarm.Laid", { name: actor.name })];
}

/**
 * **SWARMING SHADOWS ON THE PREY** (07 §17: *The area moves with your prey. Each enemy that starts its turn
 * in the area takes 4 Shadow damage. The area is Difficult ground for your enemies*): a circle Region
 * attached to the prey's token (D-707's attached aura, so core moves it with the prey and deletes it
 * with the token), carrying the card's record (`dice/chat.mjs#regionFlagsFromCard`'s shape) so the area
 * tick and the ground reconciler read it like any placed area, laid on the active GM.
 */
async function swarmLands(actor, spell, area, { cast = null, spellDC = null } = {}) {
  const made = await askGM({ act: "preyArea", casterUuid: actor.uuid, spellUuid: spell.uuid, area, cast, spellDC });
  return [t(made?.regionId ? "AZEROTH.SovSpell.Swarm.OnPrey" : "AZEROTH.SovSpell.Swarm.NotPlaced", { spell: spell.name, name: area.name })];
}

/* -------------------------------------------- */
/*  A creature's failed Resist                   */
/* -------------------------------------------- */

/**
 * **THE BLOOD CURSE, LAID** (02 §7: *A creature is under your blood curse while one of those effects of
 * yours lasts on it*): the tag on the effect the failure laid - its condition's own where it laid one -
 * or on a curse effect of its own where it laid none, with the repeated Test its entry gives as a
 * `curse` escape (`rules/escapes.mjs#CURSE_ESCAPE`), so a pass ends the curse.
 */
async function layBloodCurse({ actor, caster = null, effect = null, tag, curseEscape = null, extra = {}, name, img, span = {}, description = "" }) {
  // 04's Heavy Tread (*its Speed falls by 5 feet per rank* while it is under your blood curse) is stamped by
  // FEATURES' one curse shape (`effects/sovereign-features.mjs#bloodCurseEffectData`); its changes and mark
  // are taken from there, and the tag is this spell's (D-1241).
  let tread = { changes: [], flag: null };
  try {
    const { bloodCurseEffectData } = await import("./sovereign-features.mjs");
    const shaped = bloodCurseEffectData({ caster, name, span: {} });
    tread = { changes: shaped?.system?.changes ?? [], flag: shaped?.flags?.[SCOPE]?.heavyTread ?? null };
  } catch (err) {
    console.warn("azeroth-rpg | Heavy Tread on a blood curse", err);
  }
  if (effect) {
    const update = { [`flags.${SCOPE}.${BLOOD_CURSE_FLAG}`]: tag };
    for (const [k, v] of Object.entries(extra)) update[`flags.${SCOPE}.${k}`] = v;
    if (curseEscape) update[`flags.${SCOPE}.${ESCAPE_FLAG}`] = curseEscape;
    if (tread.changes.length) {
      update["system.changes"] = [...foundry.utils.deepClone(effect._source?.system?.changes ?? []), ...tread.changes];
      update[`flags.${SCOPE}.heavyTread`] = tread.flag;
    }
    await effect.update(update);
    return effect;
  }
  const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name, img: img ?? "icons/svg/blood.svg", origin: tag?.source ?? null, description, ...span,
    showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, system: { changes: [...tread.changes] },
    flags: { [SCOPE]: { [BLOOD_CURSE_FLAG]: tag, ...(curseEscape ? { [ESCAPE_FLAG]: curseEscape } : {}), ...(tread.flag ? { heavyTread: tread.flag } : {}), ...extra } }
  }]);
  return made ?? null;
}

/**
 * **A SOVEREIGN SPELL'S FAILED RESIST** (`dice/chat.mjs#rollResists`, on the client that rolled the Test,
 * which owns the creature), once the shared door has laid the conditions the entry bolds.
 */
export async function sovereignSpellAfterResist({ message, actor, maker = null, laid = {}, result = null } = {}) {
  const lines = [];
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "spell" || !actor || !flags.sovereignSpell) return lines;
  const effect = flags.effectHTML ?? "";
  const spell = flags.spellName ?? "";
  const caster = maker;
  const dc = Number(flags.spellDC) || null;
  const span = flags.duration ? await castSpan(actor, flags.duration, caster) : {};
  const condEffect = id => (laid?.[id]?.effectId ? actor.effects?.get?.(laid[id].effectId) ?? null : null);

  // Bleeding at the entry's number (Bleed for Me 3, Tithe of the Many 1, Crimson Cascade and the Crimson Tithe 3).
  const failBleed = readFailBleed(effect);
  const bleeding = condEffect("bleeding");
  if (failBleed && bleeding) {
    const update = { [`flags.${SCOPE}.value`]: failBleed.value };
    if (readMedicineAtDC(effect)) {
      update[`flags.${SCOPE}.${BLEED_FOR_ME_FLAG}`] = { by: caster?.uuid ?? null, dc, spell, heal: readCasterBleedHeal(effect)?.amount ?? 0 };
      update.description = `<p>${t("AZEROTH.SovSpell.BleedForMe.Medicine", { dc: dc ?? "—", spell })}</p>`;
    }
    await bleeding.update(update);
    lines.push(t("AZEROTH.SovSpell.Bleed.Laid", { name: actor.name, n: failBleed.value, spell }));
  }

  // Edict of Denial and the Crimson Tithe: no Health regained for the duration.
  const noHeal = readNoHealing(effect) ? { [NO_HEALING_FLAG]: { source: spell } } : {};

  // The blood curse: the tag, and the repeat, on what the failure laid.
  if (flags.bloodCurse === true) {
    const tag = bloodCurseRecord({ source: caster?.uuid ?? null, spell, identifier: flags.identifier ?? null, cast: flags.cast ?? null });
    const extra = { ...noHeal };
    const less = readAttackLess(effect);
    if (less) extra[ATTACK_LESS_FLAG] = { amount: less.amount, source: spell };
    if (readFirstAttackBane(effect)) extra[OVERAWE_FLAG] = { by: caster?.uuid ?? null, source: spell };
    // The second batch's curses (D-1374): Wracking Pain's Vulnerable (Physical), Burden of Sin's retaliation and
    // Hemoplague's spread ride the effect the curse is on.
    const vulnerable = readLaidVulnerable(effect);
    if (vulnerable) extra[VULNERABLE_FLAG] = { types: vulnerable.types, source: spell };
    const burden = readRetaliation(effect);
    if (burden) extra[BURDEN_FLAG] = { amount: burden.amount, school: burden.school, by: caster?.uuid ?? null, source: spell };
    const spread = readSpread(effect);
    if (spread) extra[HEMOPLAGUE_FLAG] = { by: caster?.uuid ?? null, feet: spread.feet, value: spread.value, source: spell };
    // The curse's own Test, which 04's Example to Others' copy asks of the next creature where the curse carries no
    // repeat (Wracking Pain's Body Test; D-1378): read off the card, never guessed.
    const ownTest = flags.test?.resilience ?? flags.sovereignSpell?.test ?? null;
    if (ownTest) extra.curseTest = { resilience: ownTest, dc };
    const gaze = readGaze(effect);
    let leashed = null;
    if (gaze && caster) {
      const { feetApart } = await import("../canvas/footprints.mjs");
      const { tokenOf } = (await preyFacts(caster)).core;
      const mine = tokenOf(actor);
      const theirs = tokenOf(caster);
      const from = mine && theirs ? feetApart(theirs, mine) ?? null : null;
      // FEATURES' leash record (`rules/leash.mjs#cleanLeash`): held to the caster's token, `from` R62's start.
      leashed = { holder: theirs?.uuid ?? caster.uuid, feet: gaze.feet, from, source: spell };
      extra[LEASH_FLAG] = leashed;
      if (gaze.bane) {
        const theirToken = theirs;
        extra.laidBane = { kind: "attack", banes: 1, source: spell, lasting: true, only: { actorId: caster.id ?? null, tokenId: theirToken?.id ?? null } };
      }
    }
    // The condition the failure laid carries the curse; with none, a curse effect of its own does.
    // Edict of Silence's Silenced and Hemoplague's Bleeding carry theirs too (D-1374).
    const conditionId = ["slowed", "entangled", "stunned", "silenced", "bleeding"].find(id => condEffect(id) && (flags.onFail?.statuses ?? []).includes(id)) ?? null;
    const own = conditionId ? condEffect(conditionId) : null;
    const repeats = /\bIt repeats the Test at the end of each of its turns\b/.test(String(effect).replace(/<[^>]+>/g, " "));
    // Leaden Decree's and Edict of Stillness's escape was written by the shared door; Edict of the Crown's
    // is written here on its Slowed, and a curse with no condition takes a `curse` escape.
    const resilience = flags.test?.resilience ?? flags.sovereignSpell?.test ?? null;
    // The Spell DC as cast: 04's Sovereign Will is laid on it at the prompt (FEATURES' `_escapePrompts` reads the
    // tag's caster), so it is never added here as well.
    const held = own?.flags?.[SCOPE]?.[ESCAPE_FLAG] ?? null;
    const curseEscape = repeats && !held && resilience
      // A condition the repeat-Test door does not end (Hemoplague's Bleeding) rides the curse's own escape, so a pass
      // ends the effect it rides and with it the spell (D-1374).
      ? { condition: own && ESCAPE_CONDITIONS.includes(conditionId) ? conditionId : CURSE_CONDITION, on: "turnEnd", resilience, dc, banes: 0, by: caster?.uuid ?? null, source: spell, cast: flags.cast ?? null }
      : null;
    // *Until the end of its next turn* (Captivating Gaze; Wracking Pain's Vulnerable, D-1374): the creature's own turn.
    const gazeSpan = gaze || vulnerable ? (await import("./durations.mjs")).untilEndOfNextTurnOrRound(actor) ?? {} : span;
    const cursed = await layBloodCurse({ actor, caster, effect: own, tag, curseEscape, extra, name: t("AZEROTH.SovSpell.Curse.Name", { spell }), img: flags.spellImg ?? null, span: gazeSpan, description: flags.effectHTML ?? "" });
    if (cursed) lines.push(t("AZEROTH.SovSpell.Curse.Laid", { name: actor.name, spell }));
    if (less && cursed) lines.push(t("AZEROTH.SovSpell.AttackLess.Laid", { name: actor.name, n: less.amount, spell }));
    if (leashed && cursed) lines.push(t("AZEROTH.SovSpell.Gaze.Laid", { name: actor.name, feet: Math.max(leashed.feet, leashed.from ?? 0), caster: caster.name }));
    if (Object.keys(noHeal).length && cursed) lines.push(t("AZEROTH.SovSpell.NoHealing.Laid", { name: actor.name, spell }));
    if (vulnerable && cursed) lines.push(t("AZEROTH.SovSpell.Vulnerable.Laid", { name: actor.name, types: vulnerable.types.map(k => game.i18n.localize(AZEROTH.damageTypes?.[k] ?? k)).join(", "), spell }));
    if (burden && cursed) lines.push(t("AZEROTH.SovSpell.Burden.Laid", { name: actor.name, n: burden.amount, spell }));
    if (spread && cursed) lines.push(t("AZEROTH.SovSpell.Hemoplague.Laid", { name: actor.name, feet: spread.feet, spell }));
  } else if (Object.keys(noHeal).length) {
    // The Crimson Tithe is no curse: its no-healing rides an effect of its own, for the duration.
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell, img: flags.spellImg ?? "icons/svg/blood.svg", origin: caster?.uuid ?? null, description: t("AZEROTH.SovSpell.NoHealing.Text", { spell }), ...span,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS, system: { changes: [] }, flags: { [SCOPE]: { ...noHeal } }
    }]);
    lines.push(t("AZEROTH.SovSpell.NoHealing.Laid", { name: actor.name, spell }));
  }

  // Royal Command: Charmed for the duration (the shared door laid it), ended when carried out or on harm.
  const command = readCommand(effect);
  const charmed = condEffect("charmed");
  if (command && charmed && caster) {
    await charmed.update({ ...span, [`flags.${SCOPE}.${COMMAND_FLAG}`]: { by: caster.uuid, kind: "command", spell, words: flags.sovereignSpell?.command ?? "", harmEnds: command.harmEnds } });
    await whisperCard(caster, spell, [t("AZEROTH.SovSpell.Command.Laid", { name: actor.name })],
      { presses: [{ press: "commandDone", label: game.i18n.localize("AZEROTH.SovSpell.Command.Done") }], flags: { sovereignCard: { press: "commandDone", casterUuid: caster.uuid, targetUuid: actor.uuid, effectId: charmed.id, spell } } });
    lines.push(t("AZEROTH.SovSpell.Command.Landed", { name: actor.name, caster: caster.name }));
  }

  // Mesmerize: Charmed for the duration (the shared door laid it), ended if the caster or an ally harms it (D-1375).
  if (!command && charmed && caster && readHarmEnds(effect) && !readAudience(effect)) {
    await charmed.update({ ...span, [`flags.${SCOPE}.${COMMAND_FLAG}`]: { by: caster.uuid, kind: "charm", spell, harmEnds: true } });
    lines.push(t("AZEROTH.SovSpell.Mesmerize.Landed", { name: actor.name, caster: caster.name }));
  }

  // Summons to Court's Slowed and Blood Wound's Entangled: *It is also X until the end of its next turn* (D-1376).
  const also = readAlsoConditions(effect);
  if (also.length) {
    const { inflictCondition } = await import("./inflict.mjs");
    const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
    for (const row of also) {
      if (!AZEROTH.conditions?.[row.id]) continue;
      const landing = await inflictCondition({ victim: actor, id: row.id, by: caster, name: actor.name, until: untilEndOfNextTurnOrRound(actor) ?? null });
      if (landing?.landed) lines.push(t("AZEROTH.SovSpell.Also.Laid", { name: actor.name, condition: game.i18n.localize(AZEROTH.conditions[row.id]), spell }));
    }
  }

  // Delirious Slash: *a Bane on its next Attack Test before the end of its next turn* (D-1376), spent by that Test.
  if (readNextAttackBane(effect)) {
    const { layBane } = await import("./banes.mjs");
    const { untilEndOfNextTurnOrRound } = await import("./durations.mjs");
    const laid = await layBane({ victim: actor, kind: "attack", banes: 1, source: spell, by: caster, lasting: false, span: untilEndOfNextTurnOrRound(actor) ?? null });
    if (laid) lines.push(t("AZEROTH.SovSpell.NextBane.Laid", { name: actor.name, spell }));
  }

  // Summons to Court: *pulled up to 15 feet in a straight line toward you, stopping in the first space next to you*
  // (the lead: *"reduce to 15 foot pull"*; D-1376), through the one forced-movement door.
  const pull = readPull(effect);
  if (pull && caster) lines.push(...await pullLands({ actor, caster, pull, spell }));

  // Grant an Audience: it stays, listens and attacks no one for the duration, ended on harm or by the GM.
  const audience = readAudience(effect);
  if (audience && caster) {
    const [made] = await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: spell, img: flags.spellImg ?? "icons/svg/sound.svg", origin: caster.uuid, description: t("AZEROTH.SovSpell.Audience.Text", { caster: caster.name }), ...span,
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: [{ key: "system.speed", type: "override", value: 0, phase: "final" }] },
      flags: { [SCOPE]: { [COMMAND_FLAG]: { by: caster.uuid, kind: "audience", spell, harmEnds: audience.harmEnds } } }
    }]);
    if (made) {
      await whisperCard(caster, spell, [t("AZEROTH.SovSpell.Audience.Laid", { name: actor.name })],
        { presses: [{ press: "audienceEnd", label: game.i18n.localize("AZEROTH.SovSpell.Audience.End") }], flags: { sovereignCard: { press: "audienceEnd", casterUuid: caster.uuid, targetUuid: actor.uuid, effectId: made.id, spell } }, audience: "gm" });
      lines.push(t("AZEROTH.SovSpell.Audience.Landed", { name: actor.name, caster: caster.name }));
    }
  }

  // Gaze from the Throne: the caster sees and hears the creature for the duration.
  const throne = readThroneGaze(effect);
  if (throne && caster && flags.sovereignSpell?.throne) {
    const look = flags.sovereignSpell.throne;
    await whisperCard(caster, spell, [t("AZEROTH.SovSpell.Throne.Seen", { name: look.name, feet: throne.feet })],
      { presses: [{ press: "look", label: game.i18n.localize("AZEROTH.SovSpell.Throne.Look") }], flags: { sovereignCard: { press: "look", casterUuid: caster.uuid, sceneId: look.sceneId, tokenId: look.tokenId, name: look.name } } });
    lines.push(t("AZEROTH.SovSpell.Throne.Landed", { name: look.name, caster: caster.name }));
  }

  // The caster's heal for each failure (Tithe of the Many 2, the Crimson Tithe its tier).
  const failHeal = readFailHeal(effect);
  if (failHeal && caster) {
    const n = failHealAmount(failHeal, { tier: caster.system?.tier ?? 1 });
    try {
      const healed = await healCaster(caster, n, { spell, messageId: message.id });
      lines.push(t("AZEROTH.SovSpell.FailHeal.Healed", { name: caster.name, n: healed, spell }));
    } catch (err) {
      ui.notifications?.warn(err.message);
    }
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/**
 * **A PASSED RESIST ON GAZE FROM THE THRONE** (*On a success the spell ends and the target feels watched*):
 * the creature's owners are told, read by the shared Resist door after the die.
 */
export async function sovereignSpellAfterPass({ message, actor } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "spell" || !actor || !flags.sovereignSpell?.throne) return [];
  const read = readThroneGaze(flags.effectHTML ?? "");
  if (!read?.watched) return [];
  await whisperCard(actor, flags.spellName ?? "", [t("AZEROTH.SovSpell.Throne.Watched", { name: actor.name })]);
  return [t("AZEROTH.SovSpell.Throne.Watched", { name: actor.name })];
}

/* -------------------------------------------- */
/*  The card's Apply                             */
/* -------------------------------------------- */

/**
 * **WHAT THE APPLY LANDS BESIDE THE DAMAGE** (`dice/chat.mjs#applyDamageToTargets`): the Bleeding a hit lays
 * (07 §17's Bloodbolt, Twilight Bloodbolt, Shadow Lance at SL 2, Bloodbolt Ascension), Sovereign's Kiss's
 * Tribute off the prey, Aortic Unraveling's Tribute up to the cap on a kill, and Embrace of the Vampyr's
 * feeding on a living creature, making no Test.
 */
export async function sovereignSpellAfterApply({ message, target, amount = 0, index = 0 } = {}) {
  const flags = message?.flags?.[SCOPE] ?? {};
  if (flags.kind !== "spell" || !target || !flags.sovereignSpell || flags.success !== true) return [];
  const effect = flags.effectHTML ?? "";
  const caster = actorAt(flags.caster) ?? ChatMessage.getSpeakerActor?.(message.speaker) ?? null;
  const lines = [];
  const bleed = hitBleedFor(readHitBleed(effect, { test: flags.sovereignSpell.test }), { index, sl: flags.sl ?? 0 });
  if (bleed) {
    const { inflictCondition } = await import("./inflict.mjs");
    const span = flags.duration ? await castSpan(target, flags.duration, caster) : null;
    const landing = await inflictCondition({ victim: target, id: "bleeding", value: bleed, by: caster, name: target.name, until: span && Object.keys(span).length ? span : null });
    if (landing?.landed) lines.push(t("AZEROTH.SovSpell.Bleed.Laid", { name: target.name, n: bleed, spell: flags.spellName ?? "" }));
  }
  const core = caster ? await import("./sovereign-core.mjs") : null;
  const preyTribute = readPreyTribute(effect);
  if (preyTribute && caster && Number(amount) > 0 && core.isPrey(caster, target)) {
    const r = caster.isOwner ? await core.gainTribute(caster, preyTribute.amount, "kiss", {}) : await core.askTribute(caster, preyTribute.amount, "kiss", { messageId: message.id });
    if (r?.ok !== false) lines.push(t("AZEROTH.SovSpell.Tribute.Kiss", { name: caster.name, n: preyTribute.amount }));
  }
  if (readKillTribute(effect) && caster && Number(amount) > 0 && (Number(target.system?.health?.value) || 0) <= 0) {
    const pool = core.tributePoolOf(caster);
    const gain = killTributeGain({ value: pool?.value ?? 0, max: pool?.max ?? 0 });
    if (gain > 0) {
      const r = caster.isOwner ? await core.gainTribute(caster, gain, "aortic", {}) : await core.askTribute(caster, gain, "aortic", { messageId: message.id });
      if (r?.ok !== false) lines.push(t("AZEROTH.SovSpell.Tribute.Aortic", { name: caster.name, n: gain }));
    }
  }
  if (readFeedsOn(effect) && caster) {
    const { creatureSnapshot, kindsOf } = await import("../rules/creature-kinds.mjs");
    const living = ![...kindsOf(creatureSnapshot(target))].some(k => ["undead", "construct"].includes(k)) && target.system?.undead !== true;
    if (!living) lines.push(t("AZEROTH.SovSpell.Feed.Undead", { name: target.name }));
    else if (caster.isOwner || isGM()) {
      // The mode named, never read off the target: a killing Embrace is still a feeding in a fight, not a corpse's
      // half, and needs no death time the death watch has not yet written (the reviews' N1 and S10).
      const fed = await core.feedOn(caster, target, { mode: caster.activeFight?.() ? "fight" : "out", free: true, budget: false, source: "embrace", anyDay: false });
      lines.push(t(fed?.ok ? "AZEROTH.SovSpell.Feed.Fed" : "AZEROTH.SovSpell.Feed.Not", { name: caster.name, target: target.name, reason: fed?.reason ?? "" }));
    }
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/* -------------------------------------------- */
/*  In the blow and the hold                     */
/* -------------------------------------------- */

/**
 * **MIRROR OF SELF AT THE DAMAGE DOOR** (07 §17: *When an attack hits you, you gain 8 temporary Health
 * before its damage applies*): asked of whoever answers for the Sovereign (`blow-doors.mjs#answererOf`)
 * through the blow door's own ask, the Bone Shield's shape (D-777); a yes casts the spell there - its
 * Reaction, its Vitae and its Casting Test, through `castSpell` - and the temporary Health lands before
 * the blow's own absorption step.
 *
 * @param {Actor} holder
 * @param {{amount: number, attack?: boolean, by?: Actor|null}} blow
 */
export async function mirrorInBlow(holder, blow = {}) {
  if (blow.attack !== true || !(Number(blow.amount) > 0)) return { granted: false };
  const spell = (holder?.items ?? []).find(i => i.type === "spell" && readMirror(i.system?.effect ?? "")) ?? null;
  if (!spell) return { granted: false };
  const reaction = game.system.azeroth.workflows.turnBudgetRefusal?.(holder, "reaction") === null;
  if (!reaction) return { granted: false };
  const before = Math.max(0, Math.trunc(Number(holder.system?.health?.temp)) || 0);
  const { answererOf } = await import("./blow-doors.mjs");
  const who = answererOf(holder);
  if (!who) return { granted: false };
  const deadline = Date.now() + 14000;
  const options = { targets: [], source: null };
  const ask = async () => {
    if (who.id === game.user.id) return askHereMirror(holder, spell, { ...options, answers: { mirrorOfSelf: true, deadline } });
    return who.query(SOVEREIGN_SPELL_QUERY, { act: "mirror", holderUuid: holder.uuid, spellId: spell.id, deadline }, { timeout: 15000 });
  };
  try {
    await ask();
  } catch (err) {
    console.warn("azeroth-rpg | Mirror of Self", err);
    return { granted: false };
  }
  const after = Math.max(0, Math.trunc(Number(holder.system?.health?.temp)) || 0);
  return { granted: after > before, temp: after };
}

/** Ask the Sovereign here whether to cast Mirror of Self, and cast it on a yes. */
async function askHereMirror(holder, spell, { answers, ...options }) {
  const { DialogV2 } = foundry.applications.api;
  const yes = await DialogV2.confirm({
    window: { title: spell.name },
    content: `<p>${t("AZEROTH.SovSpell.Mirror.Ask", { name: holder.name, spell: spell.name, n: spell.system?.mana ?? 0 })}</p>`,
    rejectClose: false
  });
  if (!yes) return { cast: false };
  const flow = game.system.azeroth.workflows;
  const card = await flow.castSpell({ actor: holder, spell, ...options, answers, castAs: "reaction" });
  return { cast: Boolean(card) };
}

/**
 * **MAJESTY UNBOUND ON A BLOW ON THE PREY** (07 §17: *your spells and attacks deal additional Shadow damage
 * equal to your tier to your prey. For the duration, once a turn, when you damage your prey, you regain
 * Health equal to half that damage, rounded down*): the extra, through the prey's Shadow Ward (05 §15),
 * and the heal once a turn on the caster's round record. Answers the amount the blow carries now.
 */
export async function majestyOnBlow(target, { by = null, amount = 0, attack = false, spell = false } = {}) {
  if (!by || !(attack || spell) || !(Number(amount) > 0)) return { amount };
  const row = (by.effects ?? []).find(e => e.active !== false && e.flags?.[SCOPE]?.[MAJESTY_FLAG])?.flags?.[SCOPE]?.[MAJESTY_FLAG] ?? null;
  if (!row) return { amount };
  const core = await import("./sovereign-core.mjs");
  if (!core.isPrey(by, target)) return { amount };
  const ward = Math.max(0, Math.trunc(Number(target.system?.ward?.shadow)) || 0);
  const extra = majestyExtra({ tier: by.system?.tier ?? 1, ward });
  const now = Number(amount) + extra;
  if (row.heal === "half") {
    const fight = by.activeFight?.() ?? null;
    const stamp = fight?.started ? `${fight.id}:${fight.round}:${fight.turn}` : `t${Math.floor((game.time?.worldTime ?? 0) / 6)}`;
    if (by.getFlag?.(SCOPE, MAJESTY_HEALED_FLAG) !== stamp) {
      const n = halfDown(now);
      try {
        if (by.isOwner) await by.setFlag(SCOPE, MAJESTY_HEALED_FLAG, stamp);
        const healed = await healCaster(by, n, { spell: row.source ?? "" });
        if (healed > 0) ui.notifications?.info(t("AZEROTH.SovSpell.Majesty.Healed", { name: by.name, n: healed }));
      } catch (err) {
        console.warn("azeroth-rpg | Majesty Unbound's heal", err);
      }
    }
  }
  if (extra > 0) ui.notifications?.info(t("AZEROTH.SovSpell.Majesty.Extra", { name: target.name, n: extra }));
  return { amount: now, extra };
}

/** The commands and audiences on a creature that harm by `by` ends: the caster's own, or an ally of the caster's. */
async function harmEndedIds(target, by) {
  const held = (target?.effects ?? []).filter(e => e.flags?.[SCOPE]?.[COMMAND_FLAG]?.harmEnds === true);
  const ended = [];
  for (const e of held) {
    const row = e.flags[SCOPE][COMMAND_FLAG];
    const caster = actorAt(row.by);
    let byAlly = false;
    if (caster && by !== caster) {
      const { relationTo } = await import("./area-strikes.mjs");
      byAlly = relationTo({ caster, casterToken: null, actor: by, token: null }) === "ally";
    }
    if (!harmEnds({ byCaster: by === caster || by.uuid === caster?.uuid, byAlly })) continue;
    ended.push(e.id);
  }
  return ended;
}

/**
 * **HARM BY THE CASTER OR ITS ALLIES ENDS IT** (07 §17's Royal Command and Grant an Audience: *The spell
 * ends if you or your allies harm the target*): after a blow lands, every command or audience on the
 * creature whose caster - or an ally of that caster - dealt it is ended.
 */
export async function endOnHarm(target, by = null) {
  if (!target || !by) return [];
  const ended = await harmEndedIds(target, by);
  if (!ended.length) return [];
  if (target.isOwner) await target.deleteEmbeddedDocuments("ActiveEffect", ended);
  else await askGM({ act: "endEffects", targetUuid: target.uuid, ids: ended, why: "harm", byUuid: by.uuid });
  const line = t("AZEROTH.SovSpell.Command.Harmed", { name: target.name });
  ui.notifications?.info(line);
  return [line];
}

/**
 * **UNFADING GLORY'S HOLD** (07 §17: *when a blow would drop you to 0 Health while you hold 1 or more Tribute,
 * you may spend 1 Tribute. You drop to 1 Health instead*): the creature's own, spent automatically (MY
 * call, D-1247: *may* is always taken, since declining it is the fall), off the Tribute held now.
 */
export async function unfadingHold(actor, { before = 0, amount = 0 } = {}) {
  const row = (actor?.effects ?? []).find(e => e.active !== false && e.flags?.[SCOPE]?.[UNFADING_FLAG])?.flags?.[SCOPE]?.[UNFADING_FLAG] ?? null;
  if (!row) return null;
  const core = await import("./sovereign-core.mjs");
  const pool = core.tributePoolOf(actor);
  if (!unfadingHolds({ before, amount, tribute: pool?.value ?? 0, need: row.tribute ?? 1 })) return null;
  await actor.updatePool({ itemId: pool.itemId, kind: "momentum", value: Math.max(0, (pool.value ?? 0) - (row.tribute ?? 1)) });
  const stay = Math.max(1, Math.trunc(Number(row.stay)) || 1);
  ui.notifications?.info(t("AZEROTH.SovSpell.Unfading.Held", { name: actor.name, n: row.tribute ?? 1 }));
  return { amount: Math.max(0, before - stay), held: { kind: "unfadingGlory", name: row.source ?? "" } };
}

/* -------------------------------------------- */
/*  A turn's start                               */
/* -------------------------------------------- */

/**
 * **A TURN STARTS** (the active GM's `AzerothCombat#_effectTicks`): Bleed for Me's Health back to its caster
 * (*at the start of each of your turns*), and Overawe's Bane on the cursed creature's first Attack Test of
 * the turn it starts.
 */
export async function advanceSovereignSpells(actor, combat = null) {
  const lines = [];
  if (!actor) return lines;
  lines.push(...await bleedForMeHeal(actor));
  lines.push(...await restockOverawe(actor));
  lines.push(...await hemoplagueSpread(actor, combat));
  return lines;
}

/**
 * **HEMOPLAGUE'S SPREAD** (07 §17: *At the start of each of its turns, each other enemy of yours within 10 feet of it
 * that is not **Bleeding** becomes **Bleeding 1***; D-1377): at the cursed creature's turn start (the active GM's
 * `_effectTicks`), measured footprint to footprint, the caster's enemies alone, through the one landing door.
 */
export async function hemoplagueSpread(actor, combat = null) {
  const rows = (actor?.effects ?? []).filter(e => e.active !== false && e.flags?.[SCOPE]?.[HEMOPLAGUE_FLAG]).map(e => e.flags[SCOPE][HEMOPLAGUE_FLAG]);
  if (!rows.length) return [];
  const token = [...(combat?.combatants ?? [])].find(c => c.actor === actor)?.token ?? (await preyFacts(actor)).core.tokenOf(actor);
  if (!token?.parent) return [];
  const { feetApart } = await import("../canvas/footprints.mjs");
  const { inflictCondition } = await import("./inflict.mjs");
  const lines = [];
  for (const row of rows) {
    const caster = actorAt(row.by);
    if (!caster) continue;
    const casterTok = casterToken(caster, null);
    const near = [];
    for (const tk of token.parent.tokens ?? []) {
      if (!tk.actor || tk.id === token.id) continue;
      near.push({ id: tk.id, feet: feetApart(token, tk), enemy: (await relationOf(caster, casterTok, tk.actor, tk)) === "enemy", statuses: [...(tk.actor.statuses ?? [])], down: isDown(tk) });
    }
    const reached = [];
    const said = [];
    for (const r of spreadRows(near, { feet: Number(row.feet) || 10, except: token.id })) {
      const tk = token.parent.tokens.get(r.id);
      const landing = await inflictCondition({ victim: tk.actor, id: "bleeding", value: Math.max(1, Math.trunc(Number(row.value)) || 1), by: caster, name: tk.name ?? tk.actor.name, until: null });
      if (landing?.landed) {
        reached.push(tk.uuid);
        said.push(t("AZEROTH.SovSpell.Hemoplague.Spread", { name: tk.name ?? tk.actor.name, from: actor.name, n: Math.max(1, Math.trunc(Number(row.value)) || 1) }));
      }
    }
    // The spread's card (D-1392): spoken from the carrier, naming each creature it reached, which the director plays.
    // The card says it, so the turn's own summary does not say it twice; without a card the summary does.
    const posted = reached.length ? await eventCard(actor, token, said, { hemoplagueSpread: true, targetUuids: reached }) : null;
    if (!posted) lines.push(...said);
  }
  return lines;
}

/** Summons to Court's pull: toward the caster's token, no farther than the space beside it. */
async function pullLands({ actor, caster, pull, spell }) {
  const { tokenOf } = (await preyFacts(caster)).core;
  const token = actor.token ?? tokenOf(actor);
  const own = tokenOf(caster);
  const { forceMove, forcedWords } = await import("./forced-movement.mjs");
  if (!token || !own || token.parent?.id !== own.parent?.id) return [forcedWords({ name: actor.name, reason: "unmeasured" }, { toward: "toward", source: spell })];
  const { feetApart } = await import("../canvas/footprints.mjs");
  const feet = pullFeet({ feet: pull.feet, apart: feetApart(own, token), square: own.parent.grid?.distance ?? 5 });
  if (!feet) return [t("AZEROTH.SovSpell.Pull.Beside", { name: actor.name, caster: caster.name })];
  const grid = own.parent.grid?.size ?? 100;
  const from = { x: own.x + (own.width * grid) / 2, y: own.y + (own.height * grid) / 2 };
  // The pull's own animation key (D-1392): a feature row may never use the spell's identifier.
  const r = await forceMove({ token, from, feet, toward: "toward", by: caster, name: actor.name, cue: { key: SUMMONS_PULL_KEY, by: { sceneId: own.parent.id, tokenId: own.id }, privacy: null } });
  return [forcedWords(r, { toward: "toward", source: spell })];
}

/**
 * **SHROUD OF SORROW'S DRAIN** (07 §17: *You regain 1 Health for each enemy that takes damage from this spell*;
 * D-1367): the caster's Health for one creature the tick damaged, on the active GM's client, through the one
 * healing door.
 */
export async function shroudDrain({ caster, victim = null, per = 1, spell = {} } = {}) {
  const n = Math.max(0, Math.trunc(Number(per)) || 0);
  if (!caster || !n) return [];
  const before = caster.system?.health?.value ?? 0;
  await caster.applyHealing?.(n, { from: caster, givenBy: caster, spell: true, school: "death" });
  const healed = Math.max(0, (caster.system?.health?.value ?? before) - before);
  const lines = healed ? [t("AZEROTH.SovSpell.Shroud.Drained", { name: caster.name, n: healed, target: victim?.name ?? "", spell: spell?.name ?? "" })]
    : [t("AZEROTH.SovSpell.Shroud.Struck", { name: caster.name, target: victim?.name ?? "", spell: spell?.name ?? "" })];
  // **THE TICK'S CARD** (FIXC, O-482): spoken from the caster and naming the enemy struck, which every client's
  // director plays as `shroud:tick` - here, on the active GM that landed the tick, so it is posted once. The card says
  // the drain, so the turn's own summary does not say it twice; without a card the summary does.
  const token = caster.token ?? caster.getActiveTokens?.(true, true)?.[0] ?? null;
  const posted = victim ? await eventCard(caster, token, lines, { shroudTick: true, targetUuid: victim.uuid }).catch(err => { console.warn("azeroth-rpg | Shroud of Sorrow's card", err); return null; }) : null;
  return posted ? [] : (healed ? lines : []);
}

/**
 * **BURDEN OF SIN'S BLOW** (07 §17: *For the duration, each time it damages a creature with an attack, it takes 3
 * Shadow damage*; D-1365): asked by the one damage door once an attack has taken something from a creature
 * (`rules/sovereign-spells.mjs#burdenFires`); each Sovereign's burden lands once, typed, through the area's one
 * strike door (Ward, Immune and Vulnerable), and no attack - so it fires nothing again. Here where this client owns
 * the bearer, else on the GM's.
 */
export async function burdenOnBlow(bearer, struck = null) {
  const rows = burdensOn(bearer?.effects ?? []);
  if (!rows.length) return [];
  const lines = [];
  for (const row of rows) {
    if (bearer.type === "npc" && (Number(bearer.system?.health?.value) || 0) <= 0) break;
    try {
      if (bearer.isOwner) lines.push(...await strikeBurden(bearer, row));
      else {
        const done = await askGM({ act: "burden", bearerUuid: bearer.uuid, effectId: row.effectId, struckUuid: struck?.uuid ?? null });
        lines.push(...(Array.isArray(done?.lines) ? done.lines : []));
      }
    } catch (err) {
      console.warn("azeroth-rpg | Burden of Sin", err);
    }
  }
  for (const line of lines) ui.notifications?.info(line);
  return lines;
}

/** One burden, landed on its bearer. */
async function strikeBurden(bearer, row) {
  const { strikeFromArea } = await import("./area-strikes.mjs");
  const caster = actorAt(row.by);
  const damageOutcome = {};
  const said = await strikeFromArea({ actor: bearer, caster, spell: { name: row.source, school: "death", tier: null, takesSpellpower: false }, damage: { rating: row.amount, school: row.school }, heal: null, damageOutcome, healingOutcome: {} });
  const lines = [t("AZEROTH.SovSpell.Burden.Struck", { name: bearer.name, n: row.amount, spell: row.source }), ...said];
  // The strike's card (D-1392), spoken from the bearer, which the director plays as `burden:struck`. Here, on the
  // one client that landed it (the bearer's owner or the GM), so it is posted once.
  const token = bearer.token ?? (await preyFacts(bearer)).core.tokenOf(bearer) ?? null;
  await eventCard(bearer, token, lines, { burdenStruck: true }).catch(err => console.warn("azeroth-rpg | Burden of Sin's card", err));
  return lines;
}

/** Bleed for Me: 1 Health for each creature bleeding from this caster's spell, at the caster's turn start. */
export async function bleedForMeHeal(actor) {
  const fight = actor.activeFight?.() ?? null;
  if (!fight?.started) return [];
  let n = 0;
  for (const c of fight.combatants ?? []) {
    const other = c.actor;
    if (!other || other === actor) continue;
    for (const e of other.effects ?? []) {
      const row = e.active !== false ? e.flags?.[SCOPE]?.[BLEED_FOR_ME_FLAG] ?? null : null;
      if (!row || row.by !== actor.uuid || ![...(e.statuses ?? [])].includes("bleeding")) continue;
      const read = readCasterBleedHeal(`While it bleeds from this spell, you regain ${Math.max(0, Math.trunc(Number(row.heal)) || 0)} Health at the start of each of your turns.`);
      n += read?.amount ?? 0;
    }
  }
  if (!n) return [];
  const before = actor.system?.health?.value ?? 0;
  await actor.applyHealing?.(n, { from: actor, givenBy: actor, spell: true, school: "death" });
  const healed = Math.max(0, (actor.system?.health?.value ?? before) - before);
  return healed ? [t("AZEROTH.SovSpell.BleedForMe.Healed", { name: actor.name, n: healed })] : [];
}

/** Overawe: a Bane on the first Attack Test the cursed creature makes on the turn it starts. */
export async function restockOverawe(actor) {
  const rows = (actor.effects ?? []).filter(e => e.active !== false && e.flags?.[SCOPE]?.[OVERAWE_FLAG]).map(e => e.flags[SCOPE][OVERAWE_FLAG]);
  if (!rows.length) return [];
  const { layBane } = await import("./banes.mjs");
  const { untilEndOfTurn } = await import("./durations.mjs");
  const lines = [];
  for (const row of rows) {
    const by = actorAt(row.by);
    const done = await layBane({ victim: actor, kind: "attack", banes: 1, source: row.source ?? "", by, lasting: false, span: untilEndOfTurn(actor) ?? null });
    if (done) lines.push(t("AZEROTH.SovSpell.Overawe.Bane", { name: actor.name, spell: row.source ?? "" }));
  }
  return lines;
}

/* -------------------------------------------- */
/*  The card's presses                           */
/* -------------------------------------------- */

/**
 * **A SOVEREIGN CARD'S PRESS** (`dice/chat.mjs`'s `sovereignCard` action): *Look* (Eyes of the Swarm, Gaze
 * from the Throne: a Half-Action for the swarm, judged before it is spent), *Broken* (Oath of Fealty),
 * *Command carried out* (Royal Command) and the GM's *End the audience* (Grant an Audience).
 */
export async function sovereignCardPress(button, message) {
  const row = message?.flags?.[SCOPE]?.sovereignCard ?? null;
  const press = button?.dataset?.sovPress ?? row?.press ?? null;
  if (!row || !press) return null;
  const caster = actorAt(row.casterUuid);
  if (press === "look") {
    const { lookRefusal, lookThrough } = await import("./necromancer-talents.mjs");
    const plan = { sceneId: row.sceneId, tokenId: row.tokenId, name: row.name };
    const unseen = lookRefusal(plan);
    if (unseen) { ui.notifications?.warn(unseen.words); return null; }
    // The swarm's look costs a Half-Action in a started fight (07 §17: *you may spend a Half-Action*).
    if (caster && caster.activeFight?.()?.started && message.flags?.[SCOPE]?.kind === "sovereignSpell") {
      const short = game.system.azeroth.workflows.turnBudgetRefusal?.(caster, "half");
      if (short) { ui.notifications?.warn(t(short.reason, short.params ?? {})); return null; }
      if (!(await game.system.azeroth.workflows.spendTurnBudget(caster, "half"))) return null;
    }
    return lookThrough(plan);
  }
  if (press === "oathBroken") {
    if (!caster) return null;
    await whisperCard(caster, row.spell ?? "", [t("AZEROTH.SovSpell.Oath.Broken", { name: actorAt(row.who)?.name ?? "" })]);
    return true;
  }
  // Blood Bond: *You may end the bond at any time* - the caster's own press (D-1373).
  if (press === "bondEnd") {
    if (!caster?.isOwner) { ui.notifications?.warn(game.i18n.localize("AZEROTH.SovSpell.Bond.CasterOnly")); return null; }
    const target = actorAt(row.targetUuid);
    const ids = (target?.effects ?? []).filter(e => e.flags?.[SCOPE]?.[BOND_FLAG]?.by === caster.uuid).map(e => e.id);
    if (!ids.length) return null;
    if (target.isOwner) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
    else await askGM({ act: "endEffects", targetUuid: target.uuid, ids, casterUuid: caster.uuid });
    ui.notifications?.info(t("AZEROTH.SovSpell.Bond.Ended", { name: target.name, caster: caster.name }));
    return true;
  }
  if (press === "commandDone" || press === "audienceEnd") {
    if (press === "audienceEnd" && !isGM()) { ui.notifications?.warn(game.i18n.localize("AZEROTH.SovSpell.Audience.GMOnly")); return null; }
    const target = actorAt(row.targetUuid);
    if (!target?.effects?.get?.(row.effectId)) return null;
    if (target.isOwner) await target.deleteEmbeddedDocuments("ActiveEffect", [row.effectId]);
    else await askGM({ act: "endEffects", targetUuid: target.uuid, ids: [row.effectId], casterUuid: row.casterUuid ?? null });
    ui.notifications?.info(t("AZEROTH.SovSpell.Command.Ended", { name: target.name, spell: row.spell ?? "" }));
    return true;
  }
  return null;
}

/* -------------------------------------------- */
/*  The GM's side                                */
/* -------------------------------------------- */

/**
 * **THE GM-SIDE HANDLER** (`SOVEREIGN_SPELL_QUERY`): every write a Sovereign spell makes on a document the
 * asker does not own, judged again here off the world as it stands. Throws with the reason.
 */
export async function sovereignSpellQueryHandler(payload = {}, { user = null } = {}) {
  const caster = payload.casterUuid ? await fromUuid(payload.casterUuid) : null;
  const ownsCaster = !user || user.isGM || caster?.testUserPermission?.(user, "OWNER") === true;
  switch (payload.act) {
    case "heal": {
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.SovSpell.Refuse.notYours"));
      const before = caster.system?.health?.value ?? 0;
      await caster.applyHealing?.(Math.max(0, Math.trunc(Number(payload.amount)) || 0), { from: caster, givenBy: caster, spell: true, school: "death" });
      return { healed: Math.max(0, (caster.system?.health?.value ?? before) - before) };
    }
    case "effect": {
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.SovSpell.Refuse.notYours"));
      const target = await fromUuid(payload.targetUuid);
      if (!target) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      // **AN EFFECT ONLY WHERE ITS OWN FLAGS NAME THE ASKER'S CASTER** (D-982; the fix pass's B1): a spell's
      // known flag (`rules/sovereign-asks.mjs#SPELL_EFFECT_KEYS`) naming this caster, no change and no
      // condition a Sovereign spell's effect does not lay elsewhere.
      const judged = layJudgement({ data: payload.data ?? null, keys: SPELL_EFFECT_KEYS, conditions: Object.keys(globalThis.CONFIG?.AZEROTH?.conditions ?? {}) });
      if (!judged.ok || judged.by !== caster.uuid) throw new Error(game.i18n.localize(`AZEROTH.SovereignAsk.${judged.ok ? "unknownEffect" : judged.reason}`));
      const [made] = await target.createEmbeddedDocuments("ActiveEffect", [foundry.utils.deepClone(payload.data)]);
      return { effectId: made?.id ?? null };
    }
    case "endEffects": {
      const target = await fromUuid(payload.targetUuid);
      if (!target) return { ended: 0 };
      // **ONLY WHAT THE ASKER MAY END** (the fix pass's B1): an effect whose own flags or origin name an actor
      // the asker owns, the creature's own where the asker owns it, or - for harm (*The spell ends if you or
      // your allies harm the target*) - a command the asker's creature's blow ends, judged again here.
      const gm = !user || user.isGM === true;
      const owns = doc => gm || doc?.testUserPermission?.(user, "OWNER") === true;
      const harmer = payload.why === "harm" && payload.byUuid ? await fromUuid(payload.byUuid) : null;
      const harmed = harmer && owns(harmer) ? await harmEndedIds(target, harmer) : [];
      const ids = (payload.ids ?? []).filter(id => {
        const e = target.effects?.get?.(id);
        if (!e) return false;
        if (owns(target) || harmed.includes(id)) return true;
        return namedBy(e, SPELL_EFFECT_KEYS).concat(e.origin ? [e.origin] : []).some(uuid => owns(actorAt(uuid)));
      });
      if (!ids.length && (payload.ids ?? []).length) throw new Error(game.i18n.localize("AZEROTH.SovereignAsk.drop"));
      if (ids.length) await target.deleteEmbeddedDocuments("ActiveEffect", ids);
      return { ended: ids.length };
    }
    case "seal": {
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.SovSpell.Refuse.notYours"));
      const doc = await fromUuid(payload.uuid);
      if (!doc) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      await doc.setFlag(SCOPE, SEAL_FLAG, payload.record);
      return { ok: true };
    }
    case "sealReport": {
      const doc = await fromUuid(payload.uuid);
      const record = doc?.flags?.[SCOPE]?.[SEAL_FLAG] ?? null;
      if (record) await reportSeal(doc, record, doc.name);
      return { ok: Boolean(record) };
    }
    case "swarm": {
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.SovSpell.Refuse.notYours"));
      const scene = game.scenes?.get(payload.sceneId);
      if (!scene) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const [made] = await scene.createEmbeddedDocuments("Token", [{
        name: payload.name, x: payload.x, y: payload.y, width: 1, height: 1, hidden: false,
        texture: { src: payload.img || "icons/creatures/mammals/bat-giant-tattered-purple.webp" },
        sight: { enabled: true }, disposition: caster.prototypeToken?.disposition ?? 1,
        flags: { [SCOPE]: { [LOOK_FLAG]: { kind: "swarm", by: caster.uuid } } }
      }]);
      return { tokenId: made?.id ?? null };
    }
    case "preyArea": {
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.SovSpell.Refuse.notYours"));
      return placePreyArea(caster, payload);
    }
    case "burden": {
      // Burden of Sin's blow (D-1365): the burden read off the bearer's own effect, never the payload; asked by a GM
      // or the owner of the creature the bearer's attack damaged.
      const bearer = await fromUuid(payload.bearerUuid);
      const struck = payload.struckUuid ? await fromUuid(payload.struckUuid) : null;
      const row = burdensOn(bearer?.effects ?? []).find(r => r.effectId === payload.effectId) ?? null;
      const judged = burdenClaim({ held: Boolean(row), asker: { gm: !user || user.isGM === true, ownsStruck: struck?.testUserPermission?.(user, "OWNER") === true } });
      if (!judged.ok) throw new Error(game.i18n.localize(`AZEROTH.SovereignAsk.${judged.reason}`));
      return { lines: await strikeBurden(bearer, row) };
    }
    case "draught": {
      // Sanguine Draught's Health (D-1369): judged off the caster's once-a-day record and the creature, the amount the
      // caster's tier; one landing a feeding, marked on the creature.
      if (!caster || !ownsCaster) throw new Error(game.i18n.localize("AZEROTH.SovSpell.Refuse.notYours"));
      const target = await fromUuid(payload.targetUuid);
      if (!target) throw new Error(game.i18n.localize("AZEROTH.Card.TargetGone"));
      const { FED_TODAY_FLAG } = await import("../rules/feeding.mjs");
      const fedAt = caster.getFlag?.(SCOPE, FED_TODAY_FLAG)?.[target.uuid] ?? null;
      const judged = draughtClaim({ asker: { gm: !user || user.isGM === true, owns: ownsCaster }, fedAt, now: game.time?.worldTime ?? 0,
        taken: target.getFlag?.(SCOPE, "draughtTaken") ?? null, bleeding: target.statuses?.has?.("bleeding") === true });
      if (!judged.ok) return { ok: false, reason: judged.reason, words: game.i18n.localize(`AZEROTH.SovereignAsk.${judged.reason}`) };
      const loss = Math.max(1, Math.trunc(Number(caster.system?.tier)) || 1);
      await target.setFlag(SCOPE, "draughtTaken", judged.fedAt);
      await target.loseHealth(loss);
      return { ok: true, loss };
    }
    case "mirror": {
      const holder = await fromUuid(payload.holderUuid);
      const spell = holder?.items?.get?.(payload.spellId) ?? null;
      if (!holder || !spell) return { cast: false };
      // Asked by the client the blow lands on (a GM or the holder's owner), for Mirror of Self, while the
      // Reaction is free and the blow's deadline holds (the fix pass's B1).
      const judged = mirrorClaim({
        asker: { gm: !user || user.isGM === true, owns: !user || user.isGM === true || holder.testUserPermission?.(user, "OWNER") === true },
        mirror: spell.type === "spell" && Boolean(readMirror(spell.system?.effect ?? "")),
        reaction: game.system.azeroth.workflows.turnBudgetRefusal?.(holder, "reaction") === null,
        deadline: payload.deadline ?? null, now: Date.now()
      });
      if (!judged.ok) throw new Error(game.i18n.localize(`AZEROTH.SovereignAsk.${judged.reason}`));
      return askHereMirror(holder, spell, { targets: [], source: null, answers: { mirrorOfSelf: true, deadline: payload.deadline } });
    }
    default:
      throw new Error(`azeroth-rpg | unknown Sovereign spell act ${payload.act}`);
  }
}

/** Swarming Shadows' Region on the prey's token (the active GM's): attached, with the card's record. */
async function placePreyArea(caster, { spellUuid = null, area = {}, cast = null, spellDC = null } = {}) {
  const scene = game.scenes?.get(area.sceneId) ?? null;
  const token = scene?.tokens?.get(area.tokenId) ?? null;
  if (!token) return { regionId: null };
  const spell = spellUuid ? await fromUuid(spellUuid) : null;
  const sys = spell?.system ?? {};
  const { readAreaTick } = await import("../rules/area-ticks.mjs");
  const tick = readAreaTick(sys.effect ?? "", { damage: sys.damage ?? null, target: sys.target ?? "" });
  const grid = scene.grid?.size ?? 100;
  const feetPer = scene.grid?.distance ?? 5;
  const radius = ((area.feet ?? 10) / feetPer) * grid + (token.width * grid) / 2;
  const cx = token.x + (token.width * grid) / 2;
  const cy = token.y + (token.height * grid) / 2;
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: spell?.name ?? "Swarming Shadows",
    color: "#5a1730",
    // Drawn whichever layer is active, as every spell area is (`canvas/regions.mjs`), so its region cue and
    // its loop play for every reader of a public cast (ANIM; `animation-sound-census.test.mjs`).
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    shapes: [{ type: "circle", x: cx, y: cy, radius, radiusX: radius, radiusY: radius }],
    attachment: { token: token.id },
    flags: { [SCOPE]: {
      // The spell's identifier beside its cast, as `dice/chat.mjs#regionFlagsFromCard` writes it: what the
      // animation layer's region cue and its `sustain-region` loop find the Region by (ANIM; D-729).
      identifier: sys.identifier ?? null,
      caster: caster.uuid, cast, sustained: true, spellDC,
      areaTick: tick ?? null,
      areaGround: sys.areaGround ? foundry.utils.deepClone(sys.areaGround) : null,
      spell: { name: spell?.name ?? "", school: sys.school ?? null, tier: sys.tier ?? null, identifier: sys.identifier ?? null, uuid: spellUuid },
      preyArea: { tokenId: token.id, feet: area.feet ?? 10 }
    } }
  }]);
  return { regionId: region?.id ?? null };
}

/* -------------------------------------------- */
/*  Registration                                 */
/* -------------------------------------------- */

/** The hooks the spells answer: the claws' held blood, a sealed door and a sealed sheet. Registered once at init. */
export function registerSovereignSpellHooks() {
  onClawHit(payload => rememberClawBlood(payload).catch(err => console.warn("azeroth-rpg | held blood", err)));
  Hooks.on("updateWall", (wall, change) => sealOnWall(wall, change).catch(err => console.warn("azeroth-rpg | Royal Seal", err)));
  for (const hook of ["renderItemSheet", "renderJournalEntrySheet", "renderJournalSheet"]) {
    Hooks.on(hook, app => sealOnSheet(app).catch(err => console.warn("azeroth-rpg | Royal Seal", err)));
  }
}
