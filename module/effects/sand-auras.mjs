/**
 * **07 §12's TEMPORAL SANCTUARY AND BASTION OF HOURS, WHERE THEY TOUCH THE WORLD** (O-265,
 * built in the 2a fix stage). `rules/sand-auras.mjs` is the law. The auras themselves ride the
 * one aura door (`effects/auras.mjs`): `sandAuraSources` hands it each source a laid effect holds
 * up, and the door measures, diffs and writes the aura effects - Temporal Sanctuary's `immuneTo`
 * of every condition, Bastion of Hours' Taunt Bane.
 *
 * What the aura door cannot do is Temporal Sanctuary's hold: *the conditions and effects already
 * on it do nothing and do not count down. They resume when it leaves the area or the spell ends.*
 * `syncSanctuaryHold` is that reconciler, on the active GM's client: while a creature carries a
 * Sanctuary aura every holdable effect on it is switched off and stamped with when the hold began;
 * once it carries none each is switched back on, its span grown by what passed while it was held
 * (`releasedDuration`). Core's expiry registry tracks only an ACTIVE effect (14.367
 * `ActiveEffect#isExpiryTrackable`), so a held effect cannot expire while it is held.
 *
 * **07 §12's Stasis holds through the same reconciler** (O-306, D-898): its carrier
 * (`rules/chronomancer.mjs#openHold`) is a hold as a Sanctuary aura is (`rules/sand-auras.mjs
 * #holdStands`), so *nothing already affecting it advances while this runs* is this hold, and the
 * carrier's deletion resumes what it held.
 */

import { AURA_FLAG, payloadFromFlag } from "../rules/auras.mjs";
import { ALL_CONDITIONS } from "../rules/sand-spells.mjs";
import { HELD_FLAG, heldStamp, holdStands, holdable, releasedDuration, sandAuraSource } from "../rules/sand-auras.mjs";
import { openHold } from "../rules/chronomancer.mjs";

/**
 * Every aura source this creature's laid effects hold up (Temporal Sanctuary, Bastion of Hours),
 * for `effects/auras.mjs#auraSourcesOf`.
 *
 * @param {Actor} actor
 */
export function sandAuraSources(actor) {
  if (!actor) return [];
  const holder = { uuid: actor.uuid, id: actor.id, conditions: ALL_CONDITIONS };
  return [...(actor.effects ?? [])].map(e => sandAuraSource(e, holder)).filter(Boolean).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Whether this creature is held out of time now: a Temporal Sanctuary aura switched on, or 07 §12's
 * Stasis carrier (O-306, D-898; `rules/sand-auras.mjs#holdStands`, the one judgement).
 */
function sanctuaryHolds(actor) {
  return holdStands([...(actor?.effects ?? [])], payloadFromFlag);
}

/** A plain reading of an effect, for `holdable`. */
function plainOf(e) {
  return { id: e.id, active: e.active, disabled: e.disabled, statuses: e.statuses, temporary: e.isTemporary === true, flags: e.flags };
}

/** The fight's clock now, for the hold's stamp and its release. */
function clockNow(actor) {
  const fight = actor?.activeFight?.() ?? null;
  return fight?.started
    ? { round: fight.round, turn: fight.turn, turns: fight.turns?.length ?? null, time: game.time?.worldTime ?? 0 }
    : { round: null, turn: null, turns: null, time: game.time?.worldTime ?? 0 };
}

/**
 * **HOLD OR RESUME WHAT IS ON ONE CREATURE**, to match whether a Sanctuary stands on it. Runs on
 * the active GM's client alone (it writes on other people's creatures, as the aura pass does).
 * Answers how many effects it wrote.
 *
 * @param {Actor} actor
 * @returns {Promise<number>}
 */
export async function syncSanctuaryHold(actor) {
  if (!actor || game.users?.activeGM?.isSelf !== true) return 0;
  const now = clockNow(actor);
  const updates = [];
  if (sanctuaryHolds(actor)) {
    for (const e of actor.effects ?? []) {
      if (!holdable(plainOf(e))) continue;
      updates.push({ _id: e.id, disabled: true, [`flags.azeroth-rpg.${HELD_FLAG}`]: heldStamp(now) });
    }
  } else {
    for (const e of actor.effects ?? []) {
      const held = e.flags?.["azeroth-rpg"]?.[HELD_FLAG] ?? null;
      if (!held) continue;
      updates.push({
        _id: e.id, disabled: false, ...(releasedDuration(e.duration ?? null, held, now) ?? {}),
        [`flags.azeroth-rpg.${HELD_FLAG}`]: foundry.data.operators.ForcedDeletion.create()
      });
    }
  }
  if (!updates.length) return 0;
  // No floating text (the aura door's own rule): a hold comes and goes with every step across the edge.
  await actor.updateEmbeddedDocuments("ActiveEffect", updates, { animate: false });
  return updates.length;
}

/** Whether an effect is an aura carrying Temporal Sanctuary's hold. */
function holdsAura(effect) {
  return payloadFromFlag(effect?.flags?.["azeroth-rpg"]?.[AURA_FLAG] ?? null).hold === true;
}

/**
 * The hooks: a Sanctuary aura laid, lifted or switched on or off on a creature re-holds it. Every
 * other effect write is the hold's own or nobody's. Registered once at `init` (`azeroth.mjs`).
 */
export function registerSandAuraHooks() {
  const nudge = effect => {
    const actor = effect?.parent?.documentName === "Actor" ? effect.parent : null;
    if (actor) syncSanctuaryHold(actor).catch(err => console.warn("azeroth-rpg | Temporal Sanctuary's hold", err));
  };
  // Stasis's carrier holds and resumes through the same reconciler (O-306, D-898).
  const holds = effect => holdsAura(effect) || openHold(effect);
  Hooks.on("createActiveEffect", effect => { if (holds(effect)) nudge(effect); });
  Hooks.on("deleteActiveEffect", effect => { if (holds(effect)) nudge(effect); });
  Hooks.on("updateActiveEffect", (effect, changes) => { if (holds(effect) && "disabled" in (changes ?? {})) nudge(effect); });
}
