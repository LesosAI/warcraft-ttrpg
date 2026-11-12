/**
 * **07 §12's NEVER WAS AND MOMENT'S WARNING, CAST FROM THE INCOMING ATTACK'S CARD** (O-264, the
 * 2a fix stage; the lead: *"We need automation and animations fully complete for everything"*).
 * `rules/sand-spells.mjs` is the law (`readAttackAnswer`, `attackAnswerPlan`,
 * `attackAnswerRefusal`); this is the reading of the card and the write.
 *
 * - **The offer**: an attack card that hit offers each Chronomancer who knows one of the two a
 *   button on each row it changes (`answerOffers`), shown to a client owning such a caster
 *   (`data-sand-answer`, `dice/chat.mjs`).
 * - **The press** casts the spell through the cast's own door (`castSpell`'s `answers`), which
 *   judges again before anything is paid (`judgeAttackAnswer`: a card is a record of a moment),
 *   pays the Reaction and the Mana, rolls the Casting Test, and only on a success lands what the
 *   spell does (`landAttackAnswer`).
 * - **The landing** is Afterimage's (`workflows.useFeature`'s `negating`), on the creature STRUCK:
 *   its one-attack mark - negating for a miss, an amount for Moment's Warning's lower SL - which
 *   the card's Apply spends, the card's row annotated (`dice/annotate.mjs#annotateMitigation`),
 *   and on a miss everything the hit laid withdrawn (`effects/miss.mjs#withdrawHit`). Here where
 *   this client owns the creature struck, else on the active GM's client (`SAND_ANSWER_QUERY`),
 *   whose handler judges again off the documents.
 */

import { annotateMitigation, targetActorOf } from "../dice/annotate.mjs";
import { withdrawHit, withdrawnWords } from "./miss.mjs";
import { cardPressUnrecordable } from "./card-presses.mjs";
import { gmAbsentFor } from "../rules/gm-writes.mjs";
import { unansweredBy } from "../rules/reactions.mjs";
import { attackAnswerPlan, attackAnswerRefusal, readAttackAnswer } from "../rules/sand-spells.mjs";

export const SAND_ANSWER_QUERY = "azeroth-rpg.sandAnswer";

/** The spells on this actor that answer an attack, `{item, read}`, sorted by name. */
export function answerSpellsOf(actor) {
  return [...(actor?.items ?? [])]
    .filter(i => i.type === "spell")
    .map(item => ({ item, read: readAttackAnswer(item.system?.effect ?? "") }))
    .filter(r => r.read)
    .sort((a, b) => a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id));
}

/** The attack card's total and the Defense its Test was rolled against. */
function cardNumbers(card) {
  const roll = card?.rolls?.[0] ?? null;
  const total = Number(roll?.total);
  const dc = Number(roll?.options?.dc ?? card?.flags?.["azeroth-rpg"]?.dc);
  return { total: Number.isFinite(total) ? total : null, dc: Number.isFinite(dc) ? dc : null };
}

/**
 * **WHAT THE CARD OFFERS ON EACH ROW** (at the attack card's render): for each row the attack hit,
 * the identifiers of the answering spells any character in the world knows that would change the
 * blow - Never Was always, Moment's Warning only where it turns the hit into a miss or lowers its
 * SL. Sorted; empty where nobody knows one.
 *
 * @param {{total: number, dc: number, rows: Array<{index: number, name: string, hit: boolean}>}} o
 * @returns {Array<{index: number, name: string, spells: Array<{identifier: string, name: string}>}>}
 */
export function answerOffers({ total, dc, rows = [] } = {}) {
  const known = new Map();
  for (const actor of game.actors ?? []) {
    if (actor.type !== "character") continue;
    for (const { item, read } of answerSpellsOf(actor)) {
      const id = item.system?.identifier || item.name.slugify();
      if (!known.has(id)) known.set(id, { identifier: id, name: item.name, read });
    }
  }
  if (!known.size) return [];
  const spells = [...known.values()].sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const row of rows) {
    if (!row?.hit) continue;
    const here = spells.filter(s => {
      const plan = attackAnswerPlan(s.read, { total, dc });
      return plan && !plan.none;
    }).map(s => ({ identifier: s.identifier, name: s.name }));
    if (here.length) out.push({ index: row.index, name: row.name ?? "", spells: here });
  }
  return out;
}

/**
 * **WHETHER THIS CAST MAY ANSWER THAT ROW, AND WHAT IT WOULD DO** - judged before anything is
 * paid (`castSpell`), and with every fact read off the documents now.
 *
 * @param {{caster: Actor, sys: object, answers: {messageId?: string, index?: number}|null}} o
 * @returns {{refused: string|null, plan: object|null, card: ChatMessage|null, index: number|null, struck: Actor|null, words?: string}}
 */
export function judgeAttackAnswer({ caster, sys, answers = null } = {}) {
  const read = readAttackAnswer(sys?.effect ?? "");
  const card = answers?.messageId ? (game.messages?.get(answers.messageId) ?? null) : null;
  const index = Number.isInteger(answers?.index) ? answers.index : null;
  const flags = card?.flags?.["azeroth-rpg"] ?? {};
  const struck = index !== null ? targetActorOf(flags.targets?.[index] ?? null) : null;
  const striker = card ? (ChatMessage.getSpeakerActor(card.speaker) ?? null) : null;
  const unanswered = unansweredBy((striker?.effects ?? []).filter(e => e.active !== false).map(e => e.flags?.["azeroth-rpg"] ?? {}));
  const gmAbsent = Boolean(card) && (cardPressUnrecordable(card)
    || gmAbsentFor({ owned: [struck?.isOwner === true], isGM: game.user?.isGM === true, gmActive: Boolean(game.users?.activeGM) }));
  const refused = attackAnswerRefusal({
    named: Boolean(card) && index !== null && Boolean(struck),
    attack: flags.kind === "attack" && flags.parry !== true,
    hit: index !== null && Boolean(flags.damageByTarget?.[index]),
    withdrawn: index !== null && flags.damageByTarget?.[index]?.withdrawn === true,
    unanswered: unanswered.length > 0,
    gmAbsent
  });
  if (refused) return { refused, plan: null, card, index, struck, words: unanswered.join(", ") };
  const plan = attackAnswerPlan(read, cardNumbers(card));
  return { refused: plan ? null : ATTACK_ANSWER_NO_PLAN, plan, card, index, struck };
}

/** The refusal where the card holds no number to judge Moment's Warning by. */
const ATTACK_ANSWER_NO_PLAN = "AZEROTH.SandAnswer.NoNumbers";

/**
 * The write, here: the struck creature's one-attack mark, the card's row annotated, and on a
 * miss what the hit laid withdrawn. Answers what came of it.
 */
async function answerHere({ struck, messageId, index, mark }) {
  await struck.setFlag("azeroth-rpg", "mitigate", mark);
  await annotateMitigation({ messageId, index, mark, reaction: mark.reaction });
  const undone = mark.negate === true ? await withdrawHit(struck, { messageId, index, answeredWithLost: false }) : null;
  return { ok: true, negated: mark.negate === true, undone: undone ? withdrawnWords(struck.name, undone) : "" };
}

/** The mark a plan lays, `useFeature`'s Afterimage shape. */
export function answerMark(plan, { name = "", messageId = null } = {}) {
  if (plan?.negate) return { name, halve: false, amount: null, negate: true, reaction: "negate", messageId };
  if (plan?.amount > 0) return { name, halve: false, amount: Math.trunc(plan.amount), negate: false, reaction: "warning", messageId };
  return null;
}

/**
 * **WHAT THE SPELL DOES TO THE BLOW, NOW THAT IT IS PAID FOR AND WENT OFF** (`castSpell`, after a
 * successful Casting Test), as the card's lines.
 *
 * @param {{caster: Actor, spellName: string, judged: ReturnType<typeof judgeAttackAnswer>}} o
 * @returns {Promise<string[]>}
 */
export async function landAttackAnswer({ caster, spellName, judged }) {
  const lines = [];
  const { plan, card, index, struck } = judged ?? {};
  const name = card?.flags?.["azeroth-rpg"]?.targets?.[index]?.name ?? struck?.name ?? "";
  const mark = answerMark(plan, { name: spellName, messageId: card?.id ?? null });
  if (!mark || !struck) {
    lines.push(game.i18n.format("AZEROTH.SandAnswer.StillHits", { name, spell: spellName }));
    return lines;
  }
  let done = null;
  try {
    if (struck.isOwner) done = await answerHere({ struck, messageId: card.id, index, mark });
    else {
      const gm = game.users?.activeGM ?? null;
      if (!gm) throw new Error(game.i18n.localize("AZEROTH.Card.PressNoGM"));
      done = await gm.query(SAND_ANSWER_QUERY, { casterUuid: caster.uuid, messageId: card.id, index, mark }, { timeout: 15000 });
    }
  } catch (err) {
    ui.notifications?.warn(err.message);
  }
  if (!done?.ok) {
    lines.push(game.i18n.format("AZEROTH.SandAnswer.NotLanded", { name, spell: spellName }));
    return lines;
  }
  lines.push(game.i18n.format(done.negated ? "AZEROTH.SandAnswer.Missed" : "AZEROTH.SandAnswer.Lowered", { name, spell: spellName, n: mark.amount ?? 0 }));
  if (done.undone) lines.push(done.undone);
  return lines;
}

/**
 * The GM-side handler. The asker must own the caster, who must know a spell that answers an
 * attack; the card's row is judged again and the mark rebuilt from the caster's spell and the
 * card - never taken off the request. Throws with the reason.
 */
export async function sandAnswerQueryHandler({ casterUuid = null, messageId = null, index = null, mark = null } = {}, { user = null } = {}) {
  const caster = casterUuid ? await fromUuid(casterUuid) : null;
  if (caster?.documentName !== "Actor") throw new Error(game.i18n.localize("AZEROTH.Card.ActorGone"));
  if (user && !caster.testUserPermission(user, "OWNER")) throw new Error(game.i18n.format("AZEROTH.Reaction.Refuse.NotYours", { name: caster.name }));
  const spell = answerSpellsOf(caster).find(s => s.item.name === mark?.name) ?? null;
  if (!spell) throw new Error(game.i18n.localize("AZEROTH.SandAnswer.NotKnown"));
  const judged = judgeAttackAnswer({ caster, sys: spell.item.system, answers: { messageId, index: Number(index) } });
  if (judged.refused) throw new Error(game.i18n.format(judged.refused, { name: spell.item.name, source: judged.words ?? "" }));
  const rebuilt = answerMark(judged.plan, { name: spell.item.name, messageId: judged.card.id });
  if (!rebuilt) return { ok: true, negated: false, undone: "" };
  return answerHere({ struck: judged.struck, messageId: judged.card.id, index: judged.index, mark: rebuilt });
}

/**
 * **THE CASTERS THIS CLIENT MAY PRESS A SPELL FOR**: owned characters knowing it, the one whose
 * token this user controls first, then the user's own character, then the only one.
 *
 * @param {string} identifier
 * @returns {Actor|null}
 */
export function answeringCaster(identifier) {
  const knows = a => answerSpellsOf(a).some(s => (s.item.system?.identifier || s.item.name.slugify()) === identifier);
  const owned = (game.actors?.contents ?? []).filter(a => a.type === "character" && a.isOwner && knows(a))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const controlled = (canvas?.tokens?.controlled ?? []).map(t => t.actor).filter(Boolean);
  return owned.find(a => controlled.some(c => c.id === a.id))
    ?? owned.find(a => a.id === game.user?.character?.id)
    ?? (owned.length === 1 ? owned[0] : null);
}

/** Whether this client owns a caster knowing that spell (the card's audience). */
export function answersFor(identifier) {
  return (game.actors?.contents ?? []).some(a => a.type === "character" && a.isOwner
    && answerSpellsOf(a).some(s => (s.item.system?.identifier || s.item.name.slugify()) === identifier));
}
