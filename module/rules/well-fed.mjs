/**
 * Well Fed (D-1922). Pure, no Foundry imports (CLAUDE.md §3).
 *
 * The lead: *"Well Fed gives +1 SL on any test until the next short rest."* A
 * cooked food from Wilderness Survival lays it; you hold one at a time; a
 * Short Rest ends it, and the rest's own cooked food lays a new one after.
 *
 * **It rides the roll pipeline, never a stat** (CLAUDE.md §6): the carrier is
 * an Active Effect flagged `flags.azeroth-rpg.wellFed` with no `system.changes`,
 * `rollTest` reads it as a ticked automatic line, and the +1 is added to the
 * Success Level AFTER `resolution.mjs` has worked it out - never to the total
 * or the margin, because success is read off the margin (D-678). A failure
 * stays a failure; its SL rises by one.
 */

import { SL_CAP } from "./resolution.mjs";

/** What Well Fed adds to a Test's SL. */
export const WELL_FED_SL = 1;

/** The flag on the carrier effect (`flags.azeroth-rpg.wellFed`). */
export const WELL_FED_FLAG = "wellFed";

/** Whether an effect is the Well Fed carrier. */
export function isWellFedEffect(effect) {
  return Boolean(effect?.flags?.["azeroth-rpg"]?.[WELL_FED_FLAG]);
}

/**
 * Whether a creature is Well Fed: its effects (documents or plain
 * `{flags, disabled}`), a disabled carrier counting for nothing.
 */
export function isWellFed(effects = []) {
  for (const e of effects ?? []) if (isWellFedEffect(e) && e.disabled !== true) return true;
  return false;
}

/**
 * The roll dialog's automatic line for Well Fed, ticked, or null. Takes the
 * creature's effects, or `true`/`false` where the caller already knows.
 *
 * @returns {{key: string, label: string, sl: number, automatic: true, checked: true}|null}
 */
export function wellFedLine(effectsOrFed = []) {
  const fed = typeof effectsOrFed === "boolean" ? effectsOrFed : isWellFed(effectsOrFed);
  if (!fed) return null;
  return { key: "wellFed", label: "AZEROTH.WellFed.Line", sl: WELL_FED_SL, automatic: true, checked: true };
}

/**
 * The SL after Well Fed: +1 where fed, under 05 §2's one cap (`resolution.mjs#SL_CAP`, 10).
 * Well Fed had a cap of its own (D-1980) until the lead raised the whole cap to 10 (O-699:
 * *"raise the SL whole cap"*), so an SL already at the cap stays there. The SUCCESS is
 * untouched, because the caller reads it off the margin.
 */
export function applyWellFed(sl, { fed = true } = {}) {
  const n = Math.trunc(Number(sl)) || 0;
  if (!fed) return n;
  return Math.min(Math.max(SL_CAP, n), n + WELL_FED_SL);
}

/**
 * A rolled outcome with Well Fed applied: the SL rises, `success` is copied
 * unchanged, and `wellFed` records the bonus for the card (*SL 2 (+1 Well
 * Fed)*). Never mutates.
 *
 * **`wellFed` IS WHAT WAS ADDED** (the final review's minor 2): 0 for an SL already at the cap,
 * where it recorded 1 and the card printed *SL 10 (+1 Well Fed)* over a +1 that added nothing. A
 * card draws nothing for 0.
 */
export function withWellFed(outcome, { fed = true } = {}) {
  if (!outcome || !fed) return outcome;
  const from = Math.trunc(Number(outcome.sl)) || 0;
  const sl = applyWellFed(from, { fed: true });
  return { ...outcome, sl, wellFed: Math.max(0, sl - from) };
}

/**
 * **WHAT A SHORT REST'S MEAL LEAVES BEHIND** (D-1922; 08 §12; the review's M8):
 * the Well Fed a rest lays once it is over, as `{source, img}`, or null. A cooked
 * food eaten as the rest's food lays it (its Use says `wellFed`), and so does a
 * shared Feast: 08 §12, *Consume the Feast once; each participant gains the
 * hot-meal recovery once for that rest and is Well Fed*. A plain meal lays nothing.
 *
 * @param {{eaten?: {name?: string, img?: string, system?: {use?: {wellFed?: boolean}}}|null, feast?: {name?: string, img?: string}|null}} o
 * @returns {{source: string, img: string|null}|null}
 */
export function restWellFed({ eaten = null, feast = null } = {}) {
  if (eaten?.system?.use?.wellFed === true) return { source: String(eaten.name ?? ""), img: eaten.img ?? null };
  if (feast && typeof feast === "object") return { source: String(feast.name ?? ""), img: feast.img ?? null };
  return null;
}
