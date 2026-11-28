/**
 * **THE GM'S REVIEW RESUMES A PAID CHAIN LIGHTNING** (D-2174). The one door that posts the resolved
 * card for a cast whose arcs `castSpell` could not resolve after its successful, paid Casting
 * Test. It re-resolves the arc path from the target and the caster token the card recorded, and
 * posts the card from the card's own `chainLightningResume` record and its recorded Roll.
 *
 * **IT SPENDS NOTHING.** No Casting Test is rolled (the card's Roll is posted again), and nothing
 * here writes a pool, the turn budget, a round mark, a counter, a talent's use or the Hide: the
 * only writes are the new card and the old card's `chainLightningSuperseded`. A Static Charge, a
 * Void Surge or a Charged Steel promise the cast could have spent on a hit is not offered.
 *
 * It runs on the active GM alone and only with the review handler's execution
 * (`chain-lightning-cast.mjs#isChainResumeExecution`), which no query payload can carry; the
 * handler claims the record before calling it, and `execution.valid()` is asked after every await.
 */
import { AZEROTH } from "../config.mjs";
import { resolveRecordedDamage } from "../rules/damage-record.mjs";
import { isResumeRecord, resumeDamageOptions, resumeExplainedRating, resumedCardFlags, resumedSourceLine } from "../rules/chain-lightning-resume.mjs";
import { attackResolutionSeed } from "./attack-resolution-state.mjs";
import { isChainResumeExecution } from "./chain-lightning-cast.mjs";
import { resolveChainLightningPath } from "./chain-lightning-path.mjs";

const SCOPE = "azeroth-rpg";
const SPELL_CARD = "systems/azeroth-rpg/templates/chat/spell-card.hbs";

/** The actor a target snapshot points at (`dice/workflows.mjs#targetActorOf`'s three lines). */
function targetActorOf(t) {
  const scene = (t?.sceneId && game.scenes?.get(t.sceneId)) || globalThis.canvas?.scene || null;
  const token = t?.tokenId ? scene?.tokens?.get(t.tokenId) : null;
  return token?.actor ?? (t?.actorId ? game.actors?.get(t.actorId) : null) ?? null;
}

/**
 * @returns {Promise<{ok: true, card: ChatMessage, superseded: boolean}
 *   | {ok: false, reason: string, why?: string, posted: boolean|"unknown"}>}
 */
export async function postResumedCard({ actor, card, execution } = {}) {
  const refuse = (reason, why = null, posted = false) => ({ ok: false, reason, ...(why ? { why } : {}), posted });
  if (!isChainResumeExecution(execution) || !execution.valid()) return refuse("changed");
  const flags = card?.flags?.[SCOPE] ?? {};
  const record = flags.chainLightningResume;
  if (!isResumeRecord(record)) return refuse("evidence");
  let made;
  try {
    let spell = null;
    try { spell = await fromUuid(flags.spellUuid); } catch { spell = null; }
    if (!execution.valid()) return refuse("changed");
    if (!spell) return refuse("route", "spell");
    const route = resolveChainLightningPath({ actor, spell, source: flags.source, targets: record.initial,
      viaItem: flags.viaItem ?? false, paid: true });
    if (!route.ok) return refuse("route", route.detail ?? route.reason);
    const { targetSnapshots } = await import("../applications/roll-dialog.mjs");
    const { spellDamageExplanation } = await import("../dice/workflows.mjs");
    if (!execution.valid()) return refuse("changed");
    const targets = targetSnapshots(route.tokens.map(token => ({ id: token.id, name: token.name, actor: token.actor, scene: token.parent })));
    const damageByTarget = targets.map((t, index) => resolveRecordedDamage(resumeDamageOptions(record, t, { index, targets,
      pierceAt: record.viaItem ? 0 : Math.max(0, Math.trunc(Number(actor.spellWardPierceAt?.(record.bonusKey, t)) || 0)) })));
    const first = damageByTarget[0];
    const context = {
      ...record.context, config: AZEROTH, riderApplied: null,
      damage: first ? { final: first.damage, explanation: [spellDamageExplanation(first, resumeExplainedRating(record)),
        first.bypass === true ? game.i18n.localize("AZEROTH.Card.Bypass") : null].filter(Boolean).join(" · ") } : null,
      targets: targets.map((t, index) => ({ ...t, index, damage: damageByTarget[index]?.damage ?? null, healAmount: null })),
      source: resumedSourceLine(record.context.source, { unresolved: game.i18n.localize("AZEROTH.ChainLightning.RouteUnresolved"),
        resumed: game.i18n.localize("AZEROTH.ChainLightning.Resumed") })
    };
    const content = await foundry.applications.handlebars.renderTemplate(SPELL_CARD, context);
    const cardFlags = resumedCardFlags(flags, { fromId: card.id, targets, damageByTarget,
      attackResolution: attackResolutionSeed(targets.map(t => targetActorOf(t)?.uuid)) });
    const hidden = route.tokens.some(token => token.hidden === true);
    if (!execution.valid()) return refuse("changed");
    try {
      made = await ChatMessage.create({ speaker: foundry.utils.deepClone(card.speaker), content, rolls: card.rolls,
        ...(hidden ? { whisper: [...game.users].filter(user => user.isGM).map(user => user.id) } : {}),
        flags: { [SCOPE]: cardFlags } });
    } catch { return refuse("card", null, "unknown"); }
    if (!made) return refuse("card");
  } catch { return refuse("card", null, made ? true : false); }
  // The old card answers to the new one from here, whatever else fails: its pointer does too.
  try { await card.update({ [`flags.${SCOPE}.chainLightningSuperseded`]: made.id }); return { ok: true, card: made, superseded: true }; }
  catch { return { ok: true, card: made, superseded: false }; }
}
