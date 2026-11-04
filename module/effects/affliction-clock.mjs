/**
 * **THE WORLD CLOCK FOR CARRIED AFFLICTIONS** (D12, Phase 5a). On `updateWorldTime`,
 * on the active GM's client only, for world actors AND the unlinked token actors on
 * the viewed scene: a creature in a started fight is on the turn beat
 * (`AzerothCombat#_effectTicks`), so a poison does nothing here for it; a disease's
 * dated stages (onset, recovery, Marsh fever's weekly Test) are dated and do fire.
 *
 * R4: a long jump lands every hour, uncapped, as ONE chat card per carrier per jump
 * giving the count and the total, the damage applied once as the total. A time
 * update that arrives while an earlier one is still being written is skipped for
 * that creature (a pending set, as `dredge-poison.mjs` keeps), and the next update
 * covers the gap, because `afflictionDue` counts from the carrier's own `nextAt`.
 */

import {
  afflictionDue, AFFLICTION_FLAG, enterFight, resumeWorldClock, turnBeat, weeklyPrompted, weeklyPromptPatch
} from "../rules/afflictions.mjs";
import { afflictionsOf, landEvents, postAfflictionCard, updateAffliction } from "./afflictions.mjs";
import { postPrompt } from "./prompts.mjs";
import { PANEL_REFRESH_MS, panelNeedsRefresh } from "../rules/affliction-view.mjs";
import { registerBareAfflictionHooks } from "./bare-afflictions.mjs";

const pending = new Set();
const again = new Set();
const NS = "azeroth-rpg";
const gmHere = () => game.user?.isGM === true && game.users?.activeGM?.id === game.user.id;
const present = actor => actor?.documentName === "Actor" && Boolean(actor.id) && (game.actors?.get(actor.id) === actor || actor.isToken === true);
const fightOf = actor => (game.combats?.contents ?? []).find(c => c.started && c.getCombatantsByActor(actor)?.length) ?? null;

/** Every actor that may carry one: the world's, and the unlinked tokens of the viewed scene. */
function carriers() {
  const actors = new Map();
  for (const actor of game.actors ?? []) actors.set(actor.uuid, actor);
  for (const token of canvas?.scene?.tokens ?? []) if (token.actor) actors.set(token.actor.uuid, token.actor);
  return [...actors.values()];
}

/**
 * Advance one creature's carriers to `now`. Returns the lines posted (for a test).
 * @param {Actor} actor
 * @param {{now?: number}} [o]
 */
export async function advanceAfflictions(actor, { now = game.time?.worldTime } = {}) {
  const lines = [];
  if (!gmHere() || !present(actor) || !Number.isFinite(now)) return lines;
  // A later update that lands mid-write is answered once the first is done.
  if (pending.has(actor.uuid)) { again.add(actor.uuid); return lines; }
  pending.add(actor.uuid);
  try {
    const inFight = Boolean(fightOf(actor));
    for (const row of afflictionsOf(actor)) {
      if (!gmHere() || actor.effects.get(row.id) !== row.effect) continue;
      const { events, patch, ended } = afflictionDue(row.aff, { now, inFight });
      const weekly = events.find(e => e.type === "weekly");
      const landable = events.filter(e => e.type !== "weekly");
      if (landable.length || Object.keys(patch).length || ended) {
        const done = await landEvents(actor, row.id, landable, { patch, ended });
        if (done.lines.length) {
          lines.push(...done.lines);
          await postAfflictionCard(actor, { title: row.aff.name, lines: done.lines });
        }
        if (done.ended) continue;
      }
      // Marsh fever's weekly Test: ONE prompt, recorded so a second jump does not prompt again.
      const fresh = actor.effects.get(row.id)?.flags?.[NS]?.[AFFLICTION_FLAG] ?? row.aff;
      if (weekly && !weeklyPrompted(fresh, now)) {
        const effect = actor.effects.get(row.id);
        if (!effect) continue;
        await effect.update(Object.fromEntries(Object.entries(weeklyPromptPatch(now)).map(([k, v]) => [`flags.${NS}.${AFFLICTION_FLAG}.${k}`, v])));
        await postPrompt(actor, {
          purpose: "relapse", resilience: fresh.repeat?.weekly?.resilience ?? "body", dc: fresh.repeat?.weekly?.dc ?? fresh.dc,
          effectId: row.id, cardClass: "azeroth-card-attack", ownerSees: true,
          title: game.i18n.format("AZEROTH.Afflictions.Relapse.Title", { disease: fresh.name }),
          text: game.i18n.format("AZEROTH.Afflictions.Relapse.Text", { name: actor.name, disease: fresh.name }),
          testLabel: game.i18n.localize("AZEROTH.Afflictions.Relapse.Test")
        });
      }
    }
  } finally {
    pending.delete(actor.uuid);
    if (again.delete(actor.uuid)) lines.push(...await advanceAfflictions(actor));
  }
  return lines;
}

/**
 * **THE FIGHT BEAT** (D12): at the start of the carrier's turn each carried poison
 * lands its `turnBeat` - damage, Fatigue, the held statuses laid again and Poisoned
 * re-laid to its value. Called from `AzerothCombat#_effectTicks` on the active GM.
 * Returns the lines, which the turn's own card prints. A carrier not yet on the
 * fight clock is put on it first, so the world clock stops counting it.
 *
 * @param {Actor} actor
 * @returns {Promise<string[]>}
 */
export async function advanceAfflictionsInFight(actor) {
  const lines = [];
  if (!gmHere() || !present(actor)) return lines;
  for (const row of afflictionsOf(actor)) {
    if (actor.effects.get(row.id) !== row.effect) continue;
    const enter = enterFight(row.aff);
    if (row.aff.clock?.mode !== "fight" && Object.keys(enter).length) await updateAffliction(actor, row.id, enter);
    const events = turnBeat(row.aff);
    if (!events.length) continue;
    const done = await landEvents(actor, row.id, events, { patch: {}, ended: false });
    lines.push(...done.lines);
  }
  return lines;
}

/**
 * Put every carrier on the clock its creature is on: the fight's while it stands in a
 * started fight, the world's (`resumeWorldClock`, so the fight's duration back-ticks
 * nothing) when it does not. Idempotent; the GM's client only.
 */
export async function reconcileAfflictionClocks() {
  if (!gmHere()) return;
  const now = game.time?.worldTime;
  if (!Number.isFinite(now)) return;
  for (const actor of carriers()) {
    for (const row of afflictionsOf(actor)) {
      if (row.aff.kind !== "poison") continue;
      const mode = fightOf(actor) ? "fight" : "world";
      if ((row.aff.clock?.mode ?? "world") === mode) continue;
      // An hour-only beat keeps the world's clock through a fight, so nothing is reset on entry or exit.
      const patch = mode === "fight" ? enterFight(row.aff) : resumeWorldClock(row.aff, now);
      if (Object.keys(patch).length) await updateAffliction(actor, row.id, patch);
    }
  }
}

/**
 * Advance every creature that may carry one. **SINGLE-FLIGHT**: a time update that
 * arrives while a pass is walking the world marks one more pass and returns the running
 * one's promise, so passes never overlap and a burst of updates costs two passes at most
 * (the running one and ONE after it). A creature deleted while the pass runs is skipped.
 */
let worldPass = null;
let worldAgain = false;
export function advanceAfflictionsWorld() {
  if (!gmHere()) return Promise.resolve([]);
  if (worldPass) { worldAgain = true; return worldPass; }
  worldPass = (async () => {
    const lines = [];
    try {
      do {
        worldAgain = false;
        for (const actor of carriers()) {
          if (!present(actor) || (actor.id && actor.collection && !actor.collection.has?.(actor.id) && !actor.isToken)) continue;
          lines.push(...await advanceAfflictions(actor));
        }
      } while (worldAgain && gmHere());
    } finally { worldPass = null; worldAgain = false; }
    return lines;
  })();
  return worldPass;
}

export function registerAfflictionHooks() {
  // A bare Poisoned or Diseased is met at the document layer (effects/bare-afflictions.mjs).
  registerBareAfflictionHooks();
  const reconcile = () => { void reconcileAfflictionClocks().catch(err => console.warn("azeroth-rpg | affliction clocks", err)); };
  for (const hook of ["deleteCombat", "createCombatant", "deleteCombatant"]) Hooks.on(hook, reconcile);
  Hooks.on("updateCombat", (_, changed) => { if ("round" in changed || "started" in changed) reconcile(); });
  // A countdown ("next in 37 min") is drawn text, so it goes stale as the clock
  // moves. Every client redraws the Corruption part of each open character sheet
  // that carries an affliction, at most once a second (a trailing timer).
  let redraw = null;
  Hooks.on("updateWorldTime", () => {
    if (redraw) return;
    redraw = setTimeout(() => {
      redraw = null;
      for (const app of foundry.applications.instances.values()) {
        const actor = app.actor;
        if (!actor || actor.type !== "character" || typeof app.render !== "function") continue;
        if (!panelNeedsRefresh({ rendered: app.rendered, carried: afflictionsOf(actor).length })) continue;
        if (app._azerothAfflictionDraw) continue;
        app._azerothAfflictionDraw = true;
        void app.render({ parts: ["corruption"] }).catch(() => {}).finally(() => { app._azerothAfflictionDraw = false; });
      }
    }, PANEL_REFRESH_MS);
  });
  Hooks.on("updateWorldTime", () => {
    void advanceAfflictionsWorld().catch(err => console.warn("azeroth-rpg | affliction clock", err));
  });
}
