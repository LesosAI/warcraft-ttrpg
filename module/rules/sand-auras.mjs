/**
 * **07 §12's TWO SUSTAINED SAND AURAS** (D-864's O-265, built in the 2a fix stage; the lead:
 * *"We need automation and animations fully complete for everything"*). Pure: no Foundry
 * imports (CLAUDE.md §3).
 *
 * - **Temporal Sanctuary** (*While an ally is in the area it cannot gain a condition, and the
 *   conditions and effects already on it do nothing and do not count down. They resume when it
 *   leaves the area or the spell ends.*; the lead: *"Keep Temporal Sanctuary how it is"*): an
 *   aura on every ally within the area's radius - the caster among them (the lead's general
 *   rule, 2026-09-26) - carrying an `immuneTo` of every condition and a HOLD.
 * - **Bastion of Hours** (*each enemy within 10 feet of you takes a Bane on attacks against
 *   anyone but you*): an aura on every enemy within 10 feet carrying the Taunt Bane's own flag,
 *   sparing the holder (`rules/banes.mjs#againstSpared`).
 *
 * The cast's card records what the spell's words lay (`sandAuraOf`), the Apply stamps it on the
 * caster's own laid effect (`SAND_AURA_FLAG`), and the aura door (`effects/auras.mjs`) reads that
 * effect as a source (`sandAuraSource`), so the Sustain's end - which lifts the effect - ends the
 * aura with no path of its own.
 */

import { readSanctuary, readTauntAura } from "./sand-spells.mjs";
// 07 §12's Stasis holds what already affects its creature through this hold (O-306, D-898).
import { openHold } from "./chronomancer.mjs";

/** The laid effect's flag naming the aura its spell holds up: `{kind, feet}`. */
export const SAND_AURA_FLAG = "sandAura";

/** The flag a held effect carries while Temporal Sanctuary holds it: `{at}`. */
export const HELD_FLAG = "sanctuaryHeld";

/** The two kinds. */
export const SAND_AURA_KINDS = Object.freeze(["sanctuary", "taunt"]);

/** A radius the target line names: *A 15 ft radius centered on you*. */
function radiusOf(target) {
  const m = /\b(\d+)\s*(?:ft|feet)\s+radius\b/i.exec(String(target ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * **WHAT A SPELL'S WORDS HOLD UP AROUND ITS CASTER**, or null: Temporal Sanctuary's radius off
 * its Target line, Bastion of Hours' 10 feet off its own sentence.
 *
 * @param {{effect?: string, target?: string}} sys  the spell's system data
 * @returns {{kind: "sanctuary"|"taunt", feet: number}|null}
 */
export function sandAuraOf(sys = {}) {
  if (readSanctuary(sys?.effect ?? "")) {
    const feet = radiusOf(sys?.target);
    return feet > 0 ? { kind: "sanctuary", feet } : null;
  }
  const taunt = readTauntAura(sys?.effect ?? "");
  return taunt?.feet > 0 ? { kind: "taunt", feet: taunt.feet } : null;
}

/** A stamp made valid, or null. */
export function cleanSandAura(raw) {
  if (!raw || typeof raw !== "object" || !SAND_AURA_KINDS.includes(raw.kind)) return null;
  const feet = Math.trunc(Number(raw.feet));
  return Number.isFinite(feet) && feet > 0 ? { kind: raw.kind, feet } : null;
}

/**
 * **THE AURA SOURCE ONE LAID EFFECT HOLDS UP**, in `effects/auras.mjs#auraSourcesOf`'s shape, or
 * null where the effect is off, suppressed or carries no stamp.
 *
 * - Temporal Sanctuary: allies (the holder counts), every condition refused and a hold; one row a
 *   creature whoever cast it (`group`), as two Paladins give one Boon (D-755).
 * - Bastion of Hours: enemies, the Taunt Bane sparing the holder's actor; a row a holder, since
 *   each spares its own caster.
 *
 * @param {{id?: string, active?: boolean, disabled?: boolean, isSuppressed?: boolean, name?: string,
 *   img?: string, origin?: string|null, flags?: object}} effect
 * @param {{uuid: string, id: string, conditions?: string[]}} holder
 */
export function sandAuraSource(effect, holder = {}) {
  if (!effect?.id || !holder?.uuid || effect.active === false || effect.disabled === true || effect.isSuppressed === true) return null;
  const stamp = cleanSandAura(effect.flags?.["azeroth-rpg"]?.[SAND_AURA_FLAG]);
  if (!stamp) return null;
  const key = `${holder.uuid}:sandAura:${effect.id}`;
  const base = { key, name: effect.name ?? "", origin: holder.uuid, img: effect.img ?? "", text: "" };
  if (stamp.kind === "sanctuary") {
    return { ...base, group: "sandAura:sanctuary",
      aura: { feet: stamp.feet, targets: "allies", centre: "self", excludeOwner: false, immune: { conditions: [...(holder.conditions ?? [])] }, hold: true } };
  }
  return { ...base, group: key,
    aura: { feet: stamp.feet, targets: "enemies", centre: "self", excludeOwner: true, taunt: { banes: 1, except: { actorId: holder.id ?? null, tokenId: null } } } };
}

/**
 * **WHICH EFFECTS TEMPORAL SANCTUARY HOLDS** (*the conditions and effects already on it*): every
 * effect standing and switched on that is a condition, a timed effect, a spell's laid effect, a
 * tick, a carried affliction or a Decay - never an aura (the aura door's own), a shape (switching
 * one off is leaving it, D-769), an effect already held, or a sand aura's own carrier (two
 * Sanctuaries would switch each other off and on for ever; the implementer's reading, D-878).
 * **Nor Stasis's own carrier** (O-306, D-898): Stasis holds through this same hold
 * (`rules/chronomancer.mjs#holdOutOfTime`), and a hold that switched its own carrier off would
 * free its creature and resume at once.
 *
 * @param {{id?: string, active?: boolean, disabled?: boolean, statuses?: Iterable<string>,
 *   temporary?: boolean, flags?: object}} e  a plain reading of the effect
 */
export function holdable(e = {}) {
  if (!e?.id || e.disabled === true || e.active === false) return false;
  const f = e.flags?.["azeroth-rpg"] ?? {};
  if (f.aura || f.shape || f[HELD_FLAG] || f[SAND_AURA_FLAG] || openHold(e)) return false;
  const statuses = [...(e.statuses ?? [])];
  return statuses.length > 0 || e.temporary === true || Boolean(f.spell) || Boolean(f.tick) || Boolean(f.affliction) || Boolean(f.decay);
}

/**
 * **WHETHER A HOLD OUT OF TIME STANDS ON A CREATURE** (the one judgement the hold's reconciler
 * reads): a Temporal Sanctuary aura switched on (`hold` in its payload), or Stasis's carrier
 * switched on (O-306, D-898). Either holds what already affects the creature; neither left, it is
 * all resumed.
 *
 * @param {Array<{active?: boolean, disabled?: boolean, flags?: object}>} effects
 * @param {(flag: object|null) => {hold?: boolean}} payloadOf  the aura flag's reader (`rules/auras.mjs#payloadFromFlag`)
 */
export function holdStands(effects = [], payloadOf = () => ({})) {
  return [...(effects ?? [])].some(e => e && e.active !== false && e.disabled !== true
    && (payloadOf(e.flags?.["azeroth-rpg"]?.aura ?? null)?.hold === true || openHold(e)));
}

/** What a hold records on the effect it switches off: when it began. */
export function heldStamp({ round = null, turn = null, turns = null, time = 0 } = {}) {
  const n = v => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.trunc(Number(v)));
  return { at: { round: n(round), turn: n(turn), turns: n(turns), time: n(time) ?? 0 } };
}

const UNIT_SECONDS = Object.freeze({ seconds: 1, minutes: 60, hours: 3600, days: 86400 });

/**
 * **THE SPAN A HELD EFFECT RESUMES WITH** (*do not count down*): its duration grown by what passed
 * while it was held - rounds for a span in rounds, turns for one in turns, the world's seconds in
 * its own unit for a timed one - so it has as long left as it had when the hold began. An effect
 * with no span, or held for no time, needs nothing. Answers the patch or null.
 *
 * @param {{value?: number|null, units?: string}|null} duration
 * @param {{at?: {round: number|null, turn: number|null, turns: number|null, time: number}}|null} held
 * @param {{round?: number|null, turn?: number|null, time?: number}} now
 * @returns {{"duration.value": number}|null}
 */
export function releasedDuration(duration, held, now = {}) {
  if (duration?.value === null || duration?.value === undefined) return null;
  const v = Number(duration.value);
  if (!Number.isFinite(v) || v < 0 || !held?.at) return null;
  const at = held.at;
  let grown = 0;
  if (duration?.units === "rounds") {
    if (at.round !== null && Number.isFinite(Number(now.round))) grown = Math.max(0, Math.trunc(Number(now.round)) - at.round);
  } else if (duration?.units === "turns") {
    if (at.round !== null && at.turn !== null && at.turns > 0 && Number.isFinite(Number(now.round)) && Number.isFinite(Number(now.turn))) {
      grown = Math.max(0, (Math.trunc(Number(now.round)) - at.round) * at.turns + (Math.trunc(Number(now.turn)) - at.turn));
    }
  } else if (UNIT_SECONDS[duration?.units]) {
    const seconds = Math.max(0, (Math.trunc(Number(now.time)) || 0) - (at.time ?? 0));
    grown = Math.ceil(seconds / UNIT_SECONDS[duration.units]);
  }
  return grown > 0 ? { "duration.value": Math.trunc(v) + grown } : null;
}
