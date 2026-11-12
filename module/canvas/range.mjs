/**
 * **THE ONE RANGE DOOR** (O-288, O-293; the lead, 2026-11-10: *"If an attempt to
 * cast is out of the spells range to the target, it should be stopped before
 * resources are spent."*, *"for O-288 make sure spell and ability range is
 * considered system wide"*, *"293 - yes build that"*, *"296 - ally means willing
 * target"*; D-893).
 *
 * Every cast and every Use that names creatures asks here FIRST, before its turn
 * budget, its pool, its uses, its Boss points or its card (D-768's order), and a
 * refusal is said in words naming the target, the distance and the reach. The law
 * is pure (`rules/range.mjs`, `rules/target-line.mjs`); the measure is
 * `canvas/footprints.mjs#feetApart`, the one D-669 and D-732 measure a weapon by -
 * the nearest spaces two tokens occupy, elevation counted - and nothing measured
 * is nothing refused (D-669).
 *
 * `rules/range-doors.test.mjs` fails a cast or use door that spends before it
 * calls `spellRangeRefusal` or `useRangeRefusal`.
 */

import { feetApart, feetToPoint } from "./footprints.mjs";
import { allyOf, combatantIn, reachOfActor } from "./engaged.mjs";
import { answerReach, check, feetWords, judgesPoint, judgesTargets, rangeInText, readRange, widenReach } from "../rules/range.mjs";
import { judgeNamed, readTargetLine, willingFrom } from "../rules/target-line.mjs";

/** The scene a snapshot names, else the viewed one. */
function sceneOf(t) {
  return (t?.sceneId && globalThis.game?.scenes?.get(t.sceneId)) || globalThis.canvas?.scene || null;
}

/** The token document a target snapshot names on its own scene, or null. */
export function targetTokenDoc(t) {
  if (!t) return null;
  if (t.document) return t.document;
  if (t.parent && t.actor && t.id) return t;
  const scene = sceneOf(t);
  return t.tokenId ? (scene?.tokens?.get(t.tokenId) ?? null) : null;
}

/** The actor a target snapshot points at: its token's, else the world actor. */
function actorOfTarget(t) {
  const doc = targetTokenDoc(t);
  return doc?.actor ?? (t?.actorId ? globalThis.game?.actors?.get(t.actorId) : null) ?? null;
}

/**
 * **THE CASTER'S TOKEN ON A SCENE**: the one the cast names (`source`), a
 * synthetic actor's own, else the actor's token on the target's scene - the one
 * nearest the target where an unlinked actor has several. Null where it has none
 * there, which leaves the distance unmeasured.
 */
export function casterTokenOn(actor, scene, { source = null, target = null } = {}) {
  if (!actor || !scene) return null;
  if (source?.tokenId && (!source.sceneId || source.sceneId === scene.id)) {
    const named = scene.tokens?.get(source.tokenId) ?? null;
    if (named) return named;
  }
  if (actor.isToken && actor.token?.parent?.id === scene.id) return actor.token;
  const docs = (actor.getActiveTokens?.(false, true) ?? []).filter(d => d?.parent?.id === scene.id);
  if (docs.length <= 1 || !target) return docs[0] ?? null;
  let best = null;
  let near = Infinity;
  for (const d of docs) {
    const feet = feetApart(d, target);
    if (feet !== null && feet < near) { near = feet; best = d; }
  }
  return best ?? docs[0];
}

/**
 * **WHETHER A CREATURE IS WILLING** (the lead, 2026-11-10: *"ally means willing
 * target"*): `rules/target-line.mjs#willingFrom` over what the board says - the
 * caster, D-755's one ally rule (`allyOf`), a NEUTRAL token in a fight or out of one
 * (the lead: *"300 - neutral can be willing"*, D-900), and outside a fight they share
 * a token on the caster's own side of the board. The predicate O-293's doors read, the
 * one 07 §2's DC reads for O-296 and the one the Chronomancer's willing Uses read;
 * nothing asks a player.
 *
 * @param {Actor|null} owner
 * @param {Actor|null} other
 * @param {{ownerToken?: TokenDocument|null, otherToken?: TokenDocument|null}} [o]  the tokens the cast names, where known
 */
export function willingOf(owner, other, { ownerToken = null, otherToken = null } = {}) {
  if (!owner || !other) return false;
  const self = Boolean(owner.uuid && owner.uuid === other.uuid);
  if (self) return true;
  const fight = owner.activeFight?.() ?? null;
  const docOf = t => t?.document ?? t ?? null;
  const mine = docOf(ownerToken) ?? docOf(owner.getActiveTokens?.(true)?.[0]) ?? null;
  const theirs = docOf(otherToken) ?? docOf(other.getActiveTokens?.(true)?.[0]) ?? null;
  const sameFight = Boolean(fight?.started && combatantIn(fight, owner, mine) && combatantIn(fight, other, theirs));
  return willingFrom({
    self, ally: allyOf(owner, other), sameFight,
    casterDisposition: mine?.disposition ?? null, otherDisposition: theirs?.disposition ?? null
  });
}

/**
 * Every target measured from the caster, in the order handed in: `{name, distance,
 * self, willing, actor}`. A target on another scene than any of the caster's
 * tokens, or not on a scene at all, is unmeasured (null).
 */
export function measureTargets(actor, targets = [], { source = null } = {}) {
  const out = [];
  for (const t of targets ?? []) {
    if (!t) continue;
    const doc = targetTokenDoc(t);
    const other = actorOfTarget(t);
    const self = Boolean(other && actor && (other === actor || other.uuid === actor.uuid));
    let distance = null;
    const mine = doc?.parent ? casterTokenOn(actor, doc.parent, { source, target: doc }) : null;
    if (doc?.parent && !self) distance = mine ? feetApart(mine, doc) : null;
    if (self) distance = 0;
    const willing = self || willingOf(actor, other, { ownerToken: mine, otherToken: doc });
    out.push({ name: t.name ?? doc?.name ?? other?.name ?? "", distance, self, willing, actor: other });
  }
  return out;
}

/** The refusal's words. */
function words(reason, data) {
  return globalThis.game?.i18n?.format?.(reason, data) ?? reason;
}

/**
 * **JUDGE NAMED CREATURES AGAINST A REACH AND A TARGET LINE**: the words of the
 * first refusal, or null. Pure apart from the measure, so every door shares it.
 *
 * @param {{actor: Actor, name: string, targets: object[], reach: object|null, line?: string|null, source?: object|null}} o
 * @returns {string|null}
 */
export function judgeRange({ actor, name, targets = [], reach = null, line = null, source = null } = {}) {
  const list = (targets ?? []).filter(Boolean);
  if (!list.length) return null;
  const measured = measureTargets(actor, list, { source });
  const read = line ? readTargetLine(line) : null;
  if (read) {
    const verdict = judgeNamed(read, measured);
    if (!verdict.ok) return words(verdict.reason, { name, target: verdict.name ?? "", max: verdict.max ?? "", count: verdict.count ?? "" });
  }
  if (reach) {
    // A chain (*One creature, then two more*) reaches its later creatures from the one before,
    // never from the caster: only the first is held to the Range (stage 11, D-906).
    for (const row of read?.chain ? measured.slice(0, 1) : measured) {
      if (row.self) continue;
      const verdict = check(reach, row.distance);
      if (!verdict.ok) return words(verdict.reason, { name, target: row.name, distance: feetWords(verdict.distance), feet: verdict.feet });
    }
  }
  return null;
}

/**
 * **A SPELL'S RANGE AND TARGET LINE, AT THE CAST** (07 §9): the Range field
 * against every creature named, where the Target line names creatures rather
 * than an area (an area is judged at its placed point, `dice/chat.mjs#placeAreaFromCard`).
 * Self and an area about the caster refuse nothing.
 *
 * @param {{actor: Actor, spell: Item, targets: object[], source?: object|null}} o
 * @returns {string|null}  the refusal in words, or null
 */
export function spellRangeRefusal({ actor, spell, targets = [], source = null } = {}) {
  const sys = spell?.system ?? {};
  if (!judgesTargets(sys.target)) return null;
  const reach = readRange(sys.range);
  return judgeRange({ actor, name: spell?.name ?? "", targets, reach, line: sys.target ?? null, source });
}

/**
 * **A USE'S REACH, AT THE PRESS** - a class feature, a talent's Use, a creature's
 * ability or Boss Action, a consumable, a Signature: the first *within N feet* that
 * names its creatures (`rules/range.mjs#rangeInText`), against every creature
 * named, with the same clause's count and *willing* word. A Reaction answered from
 * a card judges the card's creature by its trigger's distance too (*attacks an
 * ally within 10 feet of you*). Text that states no reach refuses nothing.
 *
 * `cardTargets` is the card's own row where a Reaction is pressed from a card and
 * names no target of its own; it is judged against a trigger's distance alone,
 * because a *target* clause may name a creature the card does not (Another
 * Timeline's roller is the attacker, the card's row the attacked).
 *
 * @param {{actor: Actor, name: string, text: string, targets: object[], cardTargets?: object[],
 *   answering?: boolean, source?: object|null}} o
 * @returns {string|null}
 */
export function useRangeRefusal({ actor, name, text, targets = [], cardTargets = [], answering = false, source = null, widen = null } = {}) {
  // A talent that widens the Use's reach or lets it name the user (`rules/range.mjs#widenReach`;
  // Swift Current and Twinned Hours on Slipstream - the sweep's stage 4).
  const read = widenReach(rangeInText(text), widen);
  if (!read) return null;
  if (read.kind === "target") {
    // *A creature you are engaged with in melee* (Pummel; the lead: *"pummel requires melee"*): the
    // user's own reach, 5 feet or 10 with a Reach weapon - the one reading the Opportunity Attack
    // and the Engaged Bane read (`canvas/engaged.mjs#reachOfActor`, D-732).
    const reach = read.melee === true ? { feet: reachOfActor(actor), melee: true } : { feet: read.feet };
    return judgeRange({ actor, name, targets, reach, line: read.melee === true ? null : (read.clause ?? null), source });
  }
  if (answering && read.kind === "trigger") {
    const reach = answerReach(text);
    const named = (targets ?? []).length ? targets : (cardTargets ?? []);
    if (reach) return judgeRange({ actor, name, targets: named, reach, source });
  }
  return null;
}

/**
 * The creature a card's row names, as a one-row list, for a Reaction pressed
 * from the card (`{messageId, index}`); none where the card or the row is gone.
 */
export function cardTargetsOf(answers) {
  if (!answers?.messageId) return [];
  const message = globalThis.game?.messages?.get?.(answers.messageId) ?? null;
  const row = message?.flags?.["azeroth-rpg"]?.targets?.[Number(answers.index)] ?? null;
  return row ? [row] : [];
}

/**
 * **A POINT HELD TO A REACH FROM THE CASTER'S TOKEN** (07 §9: *Distances are in feet and measured
 * from the caster*; O-288, D-893): a `pickPoint` `accept` that refuses a point past the reach in
 * the range door's words and lets the pick wait on, or null where there is nothing to hold it to
 * (no token, a reach that is not feet or Touch). The card's Place area, a point a cast recorded
 * before its payment (O-314: Mindstatic, Heat Mirage) and those casts' own picks all ask it, so a
 * point is judged by one rule wherever it is chosen (stage 11, D-906).
 *
 * @param {Token|TokenDocument|null} token  the caster's
 * @param {{kind: string, feet: number|null}|null} reach  `rules/range.mjs#readRange`'s shape
 * @param {string} name  the spell or feature, for the words
 * @returns {((point: {x: number, y: number}) => boolean)|null}
 */
export function pointAccept(token, reach, name) {
  if (!token || !(reach?.kind === "feet" || reach?.kind === "touch")) return null;
  return point => {
    const verdict = check(reach, feetToPoint(token, point));
    if (verdict.ok) return true;
    globalThis.ui?.notifications?.warn?.(words("AZEROTH.Range.PointRefused", { name, distance: feetWords(verdict.distance), feet: verdict.feet }));
    return false;
  };
}

/**
 * A spell's area point held to its Range (`pointAccept`), where its Target line places the area at
 * a point (`rules/range.mjs#judgesPoint`); null for a cone, an area on the caster, or no token.
 *
 * @param {Token|TokenDocument|null} token
 * @param {Item|null} spell
 */
export function spellPointAccept(token, spell) {
  const sys = spell?.system ?? {};
  return judgesPoint(sys.target) ? pointAccept(token, readRange(sys.range), spell?.name ?? "") : null;
}

/**
 * **SAY A REFUSAL AND ANSWER WHETHER THERE WAS ONE**: the doors' one line.
 *
 * @param {string|null} words
 */
export function refuseOutOfRange(words) {
  if (!words) return false;
  globalThis.ui?.notifications?.warn?.(words);
  return true;
}

/**
 * **THE WORDS A USE IS READ OFF**: a feature's own description, else the talent
 * that grants it; a creature's ability row; a consumable's description and effect;
 * a Signature's prose.
 *
 * @param {Item|object|null} item  an Item, or a creature's ability row
 * @param {Actor|null} [actor]
 * @param {{signature?: boolean}} [o]  read the Signature's prose (the Signature door)
 */
export function useTextOf(item, actor = null, { signature = false } = {}) {
  if (!item) return "";
  if (!item.system) return String(item.description ?? item.text ?? "");
  const sys = item.system;
  if (item.type === "feature") {
    const own = String(sys.description ?? "");
    if (own.replace(/<[^>]*>/g, "").trim()) return own;
    const talentId = item.getFlag?.("azeroth-rpg", "feature")?.talentId ?? null;
    const talent = talentId ? actor?.items?.get?.(talentId) ?? null : null;
    return String(talent?.system?.effect ?? talent?.system?.description ?? "");
  }
  if (signature) return String(sys.signature ?? "");
  return `${sys.description ?? ""} ${sys.effect ?? ""}`;
}
