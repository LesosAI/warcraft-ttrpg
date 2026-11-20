/**
 * **02 §7's GRAVE GUARD, ASKED IN THE BLOW** (the Necromancer plan's door 8): *When a blow would
 * damage you, you may use your Reaction to choose one of your raised dead within 10 feet of you. The
 * blow damages that creature instead of you. That creature's Armor Points and Ward apply to it.
 * Damage beyond that creature's Health is dealt to you. **Empowered.** Spend 1 Essence. You use
 * Grave Guard without spending your Reaction, once a round.*
 *
 * A move the creature STRUCK makes (`rules/blow-doors.mjs#MOVE_KINDS`' `graveGuard`), at the one
 * damage door (`AzerothActor#applyDamage`), after the blow's own mark and any ally's move and before
 * the Necromancer's own reductions - so the servant meets the blow as it was aimed, never what the
 * Necromancer's Armor Points left of it. It depends on no card: the blow's record (D-1004) carries
 * the resolver's inputs, and the servant's Armor Points, Ward and armor by school replace the
 * Necromancer's in them (`rules/necromancer-features.mjs#graveGuardInput`). A blow with no record is
 * moved as it arrived.
 *
 * Asked of whoever answers for the Necromancer (`blow-doors.mjs#answererOf`) through the blow door's
 * own query (`act: "graveGuard"`), judged before it is asked and again after the answer, then paid
 * (the Reaction, or the round's mark and then 1 Essence). **The answerer returns only the choice and
 * the payment** (the 4b review's S2): the servant's damage and the overflow are worked out and landed
 * on the ASKER's side, which is the client waiting on the blow - so an answer arriving after the
 * asker stopped waiting can never deal the blow a second time. The overflow carries the blow's record
 * with a `graveGuard` step (S3, D-1004), so a door after this one (Icebound Fortitude) can still
 * resolve the blow that reached the Necromancer.
 */

import { GRAVE_GUARD, NECRO_FEATURES, graveGuardInput, graveGuardJudgement, graveGuardSplit } from "../rules/necromancer-features.mjs";
import { graveGuardRecord, recordOf, resolveRecord, withSteps } from "../rules/blow-records.mjs";
import { wardBySchool } from "../rules/ward.mjs";
import { schoolArmorBySchool } from "../rules/auras.mjs";
import { ESSENCE } from "../rules/essence.mjs";
import { answerInTime, answerWindow } from "../rules/chromatic-talents.mjs";

const SCOPE = "azeroth-rpg";
const t = (key, data = {}) => game.i18n.format(key, data);

/** The Necromancer's raised dead on its scene, measured from its own token (D-732). */
async function servantsNear(holder) {
  const { hordeActorsOf } = await import("./necromancer-horde.mjs");
  const own = holder?.getActiveTokens?.(true)?.[0]?.document ?? (canvas?.scene?.tokens?.find?.(tk => tk.actor === holder) ?? null);
  if (!own) return [];
  const { feetApart } = await import("../canvas/footprints.mjs");
  return hordeActorsOf(holder).map(actor => {
    const token = own.parent.tokens.find(tk => tk.actorId === actor.id) ?? null;
    return { actor, token, feet: token ? feetApart(own, token) : null, health: actor.system?.health?.value ?? 0, temp: actor.system?.health?.temp ?? 0 };
  }).filter(s => s.token).sort((a, b) => (a.feet ?? 1e9) - (b.feet ?? 1e9) || a.actor.name.localeCompare(b.actor.name));
}

const essenceOf = actor => (actor?.poolSnapshot?.() ?? []).find(p => p.kind === "momentum" && p.name === ESSENCE) ?? null;
const reactionLeft = actor => game.system.azeroth.workflows.turnBudgetRefusal?.(actor, "reaction") === null;

/** Whether this round's empowered Grave Guard is spent (the combatant's round record). */
function roundUsed(actor) {
  const fight = actor?.activeFight?.() ?? null;
  const combatant = fight?.getCombatantsByActor?.(actor)?.[0] ?? null;
  const record = combatant?.getFlag?.(SCOPE, "round") ?? null;
  return Boolean(record && record.number === fight.round && (record.once ?? []).includes(GRAVE_GUARD.roundMark));
}

/**
 * **WHETHER TO ASK AT ALL**: the holder holds the feature, a servant stands within 10 feet, and it
 * can pay one way or the other. Cheap, synchronous where it can be, before any query.
 */
async function askable(holder, amount) {
  if (holder?.type !== "character" || holder.hasFeature?.(NECRO_FEATURES.graveGuard) !== true) return null;
  const servants = await servantsNear(holder);
  const essence = essenceOf(holder)?.value ?? 0;
  const plain = graveGuardJudgement({ amount, servants, reactionLeft: reactionLeft(holder) });
  const empowered = graveGuardJudgement({ amount, servants, empowered: true, essence, roundUsed: roundUsed(holder) });
  return plain.ok || empowered.ok ? { servants, plain: plain.ok, empowered: empowered.ok } : null;
}

/**
 * **GRAVE GUARD AT THE DAMAGE DOOR** (`AzerothActor#applyDamage`): asked of the Necromancer's
 * answerer; `{guarded: false}` where it is not asked or the answer is no, else the overflow that
 * comes back to the Necromancer.
 *
 * @param {Actor} holder  the Necromancer struck
 * @param {{amount: number, type?: string|null, attack?: boolean, spell?: boolean, location?: string, by?: Actor|null, mitigation?: object|null, messageId?: string|null}} blow
 * @returns {Promise<{guarded: boolean, overflow?: number}>}
 */
export async function graveGuardInBlow(holder, blow = {}) {
  const amount = Math.max(0, Math.trunc(Number(blow.amount)) || 0);
  if (!(await askable(holder, amount))) return { guarded: false };
  const { answererOf, BLOW_ASK_QUERY, ASK_MS, blowAskHandler } = await import("./blow-doors.mjs");
  const who = answererOf(holder);
  if (!who) return { guarded: false };
  const payload = {
    act: "graveGuard", holderUuid: holder.uuid, targetUuid: holder.uuid, amount, type: blow.type ?? null,
    attack: blow.attack === true, spell: blow.spell === true, location: blow.location ?? "body", byUuid: blow.by?.uuid ?? null
  };
  let answer = null;
  try {
    answer = who.id === game.user.id ? await blowAskHandler(payload, { user: game.user }) : await who.query(BLOW_ASK_QUERY, payload, { timeout: ASK_MS });
  } catch (err) {
    ui.notifications?.warn(t("AZEROTH.BlowDoor.NoAnswer", { name: holder.name, reason: err?.message ?? "" }));
    return { guarded: false };
  }
  if (!answer?.guarded) return { guarded: false };
  return landGuard(holder, { ...blow, amount }, answer);
}

/**
 * **THE SERVANT MEETS THE BLOW, ON THE ASKER'S SIDE** (S2): the servant the answer named, found
 * again here (gone or fallen: the blow lands on the Necromancer whole, said in words); the blow's
 * recorded inputs resolved with the servant's Armor Points, Ward and armor by school (02 §7: *That
 * creature's Armor Points and Ward apply to it*), or the blow as it arrived where nothing was
 * recorded; the servant's damage landed through its own door with `moved: true`; the card; and what
 * passes its Health and temporary Health back, with the record a later door re-resolves (S3).
 */
async function landGuard(holder, blow, answer) {
  const amount = blow.amount;
  let servantActor = null;
  try { servantActor = answer.servant ? fromUuidSync(answer.servant) : null; } catch { servantActor = null; }
  const near = (await servantsNear(holder)).find(s => s.actor.uuid === servantActor?.uuid) ?? null;
  if (!near || !(near.health > 0)) {
    ui.notifications?.warn(t("AZEROTH.Horde.Refuse.guard.gone", { name: holder.name, feet: GRAVE_GUARD.feet }));
    return { guarded: false };
  }
  const record = recordOf(blow.mitigation);
  const maps = {
    apByLocation: near.actor.system?.ap ?? {}, wardBySchool: wardBySchool(near.actor.system?.ward),
    schoolArmorBySchool: schoolArmorBySchool(near.actor.system?.schoolArmor),
    immune: near.actor.system?.immune ?? [], vulnerable: near.actor.system?.vulnerable ?? []
  };
  const input = record ? graveGuardInput(record.input, maps) : null;
  const met = input ? resolveRecord({ ...record, input }) : { damage: amount, wardTook: 0, parts: null };
  const damage = Math.max(0, Math.trunc(Number(met.damage)) || 0);
  const split = graveGuardSplit({ damage, health: near.health, temp: near.temp });
  // **THE CARD BEFORE THE BLOW** (team ANI): a servant the moved blow drops collapses at once and its
  // token is deleted, and a card posted after that named a token no board holds, so the strand and the
  // ward on the servant had no anchor and Grave Guard played nothing (`no-anchor`). Every number the
  // card says is known here, before the servant meets the blow.
  const { postFeatureCard } = await import("./necromancer-horde.mjs");
  await postFeatureCard(holder, {
    key: "grave-guard", text: t(split.overflow > 0 ? "AZEROTH.Horde.GuardOverflow" : "AZEROTH.Horde.Guarded", { name: holder.name, servant: near.actor.name, n: damage, over: split.overflow }),
    targets: [{ actorId: near.actor.id, sceneId: near.token.parent.id, tokenId: near.token.id, name: near.token.name }]
  });
  if (damage > 0) {
    await near.actor.applyDamage(damage, {
      struck: true, attack: blow.attack === true, spell: blow.spell === true, location: blow.location ?? "body", type: blow.type ?? null,
      by: blow.by ?? null, moved: true, wardTook: met.wardTook ?? 0, parts: met.parts ?? null,
      mitigation: record ? withSteps({ ...record, input }, { moved: true }) : null
    });
  }
  return {
    guarded: true, overflow: split.overflow, servant: near.actor.uuid, damage,
    // **THE OVERFLOW'S RECORD** (S3): the servant-met blow, moved, less the room the servant had.
    record: record && split.overflow > 0 ? graveGuardRecord({ ...record, input }, { room: Math.max(0, near.health) + Math.max(0, near.temp) }) : null
  };
}

/**
 * **THE ANSWER, ON THE NECROMANCER'S OWN CLIENT** (`blowAskHandler`'s `graveGuard`): a dialog
 * listing the servants within 10 feet - with the Reaction, or empowered - that closes itself as no
 * before the asker stops waiting; judged again after it; paid. It returns the choice alone (S2):
 * the asker lands the servant's damage.
 */
export async function graveGuardHere({ holder, amount = 0 } = {}) {
  // **PAID ONLY WHILE THE ASKER STILL WAITS** (the fix runs' review, closing O-418): blow-doors.mjs's
  // hardened pattern (Borrowed Time's `borrowHere`, Icebound's `iceboundAskHere`) - the dialog closes
  // at `answerWindow(ASK_MS)`, and a choice judged past `answerInTime` pays nothing, so a late answer
  // never spends a Reaction or Essence on a blow the asker has already landed on the Necromancer.
  const started = Date.now();
  const first = await askable(holder, amount);
  if (!first) return { guarded: false, reason: "refused" };
  const { ASK_MS } = await import("./blow-doors.mjs");
  const choice = await chooseHere(holder, first, amount, answerWindow(ASK_MS));
  if (!choice) return { guarded: false, reason: "declined" };
  // Judged AGAIN after the dialog, then paid (D-768's order).
  const now = await servantsNear(holder);
  const servant = now.find(s => s.actor.id === choice.id) ?? null;
  const judged = graveGuardJudgement({
    amount, servants: servant ? [servant] : [], reactionLeft: reactionLeft(holder),
    empowered: choice.empowered, essence: essenceOf(holder)?.value ?? 0, roundUsed: roundUsed(holder)
  });
  if (!judged.ok || !servant) {
    ui.notifications?.warn(t(`AZEROTH.Horde.Refuse.guard.${judged.reason ?? "noServant"}`, { name: holder.name, feet: GRAVE_GUARD.feet }));
    return { guarded: false, reason: judged.reason ?? "noServant" };
  }
  if (!answerInTime(started, Date.now(), ASK_MS)) return { guarded: false, reason: "late" };
  if (choice.empowered) {
    // **THE ROUND'S MARK FIRST, THEN THE ESSENCE** (the 4b review's S1): the once-a-round mark is
    // claimed through the queued door and the use refused in words unless THIS press added it; only
    // then is the Essence taken, inside its pool queue, a short pool refused in words.
    const fight = holder.activeFight?.() ?? null;
    const combatant = fight?.getCombatantsByActor?.(holder)?.[0] ?? null;
    if (combatant?.markRoundOnce && !((await combatant.markRoundOnce(GRAVE_GUARD.roundMark))?.added === true)) {
      ui.notifications?.warn(t("AZEROTH.Horde.Refuse.guard.roundUsed", { name: holder.name, feet: GRAVE_GUARD.feet }));
      return { guarded: false, reason: "roundUsed" };
    }
    const { spendEssence } = await import("./necromancer-horde.mjs");
    if (!(await spendEssence(holder, GRAVE_GUARD.essence))) {
      // The round's mark is spent with it (the fix runs' review: acceptable), and the words say so.
      ui.notifications?.warn(t("AZEROTH.Horde.Refuse.guard.noEssenceMarked", { name: holder.name, feet: GRAVE_GUARD.feet }));
      return { guarded: false, reason: "noEssence" };
    }
  } else if (!(await game.system.azeroth.workflows.spendTurnBudget(holder, "reaction"))) {
    return { guarded: false, reason: "noReaction" };
  }
  return { guarded: true, servant: servant.actor.uuid, empowered: choice.empowered === true };
}

/** The question: one button a servant and a way to pay, and No; closes itself as no in time. */
async function chooseHere(holder, judged, amount, ms) {
  const { DialogV2 } = foundry.applications.api;
  const buttons = [];
  for (const s of judged.servants) {
    if (!(typeof s.feet === "number" && s.feet <= GRAVE_GUARD.feet + 1e-6 && s.health > 0)) continue;
    if (judged.plain) buttons.push({ action: `r:${s.actor.id}`, label: t("AZEROTH.Horde.GuardWith", { servant: s.actor.name, feet: Math.round(s.feet) }) });
    if (judged.empowered) buttons.push({ action: `e:${s.actor.id}`, label: t("AZEROTH.Horde.GuardEmpowered", { servant: s.actor.name, n: GRAVE_GUARD.essence }) });
  }
  if (!buttons.length) return null;
  buttons.push({ action: "no", label: game.i18n.localize("AZEROTH.Horde.GuardNo"), default: true });
  let dialog = null;
  const answer = DialogV2.wait({
    id: `azeroth-grave-guard-${holder.id}-${foundry.utils.randomID(6)}`,
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-blow-ask"],
    window: { title: NECRO_FEATURES.graveGuard },
    content: `<p>${t("AZEROTH.Horde.GuardAsk", { name: holder.name, n: amount, feet: GRAVE_GUARD.feet })}</p>`,
    buttons, rejectClose: false,
    render: (event, d) => { dialog = d; }
  });
  let timer = null;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve("late"), ms); });
  const result = await Promise.race([answer, late]);
  clearTimeout(timer);
  if (result === "late") {
    await dialog?.close?.();
    return null;
  }
  if (typeof result !== "string" || result === "no") return null;
  const [way, id] = result.split(":");
  return { id, empowered: way === "e" };
}
