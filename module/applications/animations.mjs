/**
 * THE STOP DOOR (D-730).
 *
 * The lead's call: *there has to be a way to stop a loop early without
 * touching game state.* A standing flame over a creature is a picture, and a
 * GM who wants it gone must not have to drop the Sustain that is still
 * running - so this window ends the PICTURE and nothing else. No Mana is
 * refunded, no effect is deleted, no token is moved.
 *
 * Two doors, and they are not the same door:
 *
 *  - **The GM's Stop is for everyone.** It writes the world setting, so the
 *    loop ends on every screen and STAYS ended through every reconcile, and
 *    Resume brings it back. A world setting is a real Setting document, so the
 *    write broadcasts and each client's `onChange` reconciles - no socket and
 *    no query (a player never writes it, which is why Stop is a GM's control
 *    and the refusal is printed for everybody else).
 *  - **A player's Hide is their own screen.** It writes their client setting
 *    and nobody else sees a thing.
 *
 * **Both key on the loop, and a loop key carries its `cast`** - so casting the
 * spell again is a new key and shows again, which is the behaviour a table
 * wants: stopping Rain of Fire is about THIS Rain of Fire.
 *
 * Modelled on the loot offer's window (D-721), down to the three things that
 * are easy to get wrong there: `tag: "div"` because nothing is submitted, one
 * instance however many doors open it, and **re-renders are never guarded on
 * `rendered`** - the state is RENDERING for the whole of `_replaceHTML`, so a
 * guarded update that arrived mid-render would simply be dropped.
 *
 * COLOUR IS NEVER THE CARRIER (CLAUDE.md §12). Every row says its state in
 * words - Playing, Stopped for everyone by Brad, Hidden on this screen,
 * Animations are off on this screen - and a greyed control has its reason
 * printed beside it.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { AZEROTH } from "../config.mjs";
import { animationRows, loopsFor, withKey, withoutKey } from "../rules/animation.mjs";
import { animationAvailability, unavailableKey } from "../animation/availability.mjs";
import { privateCasts, stateSnapshot } from "../animation/records.mjs";
import {
  animationHidden, animationLoopsEnabled, animationStops,
  setAnimationHidden, setAnimationStops
} from "../settings.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/dialog/animations.hbs";

/** One window, however many doors open it. */
const WINDOW_ID = "azeroth-animations";

/**
 * HOW FAR **RESUME ALL** REACHES, and it says so on its own label.
 *
 * It does not govern Stop all, and the select used to imply that it did. **Stop
 * all can only reach what the window can see**: `loopsFor` reads the VIEWED
 * scene, so a loop standing on another board is not in anybody's list to be
 * stopped. Resume is the asymmetric one, because a stop is a KEY the world
 * holds and the map can be cleared whole - which is the only way back for a
 * stop made on a scene the GM has since left.
 */
const SCOPES = Object.freeze({ scene: "AZEROTH.Animation.Window.Scope.Scene", all: "AZEROTH.Animation.Window.Scope.All" });

export class AzerothAnimations extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: WINDOW_ID,
    // A DIV, not a form: nothing here is submitted, and every control goes
    // through the actions map or its own `data-*` hook (CLAUDE.md §5).
    tag: "div",
    classes: ["azeroth", "azeroth-roll-dialog", "azeroth-forge", "azeroth-generator", "azeroth-animations"],
    window: { title: "AZEROTH.Animation.Window.Title", resizable: true },
    position: { width: 520, height: 520 },
    actions: {
      animationStop: AzerothAnimations.#onStop,
      animationResume: AzerothAnimations.#onResume,
      animationHide: AzerothAnimations.#onHide,
      animationShow: AzerothAnimations.#onShow,
      animationStopAll: AzerothAnimations.#onStopAll,
      animationResumeAll: AzerothAnimations.#onResumeAll,
      animationHideAll: AzerothAnimations.#onHideAll,
      animationShowAll: AzerothAnimations.#onShowAll
    }
  };

  static PARTS = { body: { template: TEMPLATE, scrollable: [".azeroth-generator-pane"] } };

  /** How far Resume all reaches: this scene, or every stop the world holds. */
  #scope = "scene";

  /**
   * THE LOOPS THE RECONCILER LAST WORKED OUT, and which board they were for.
   *
   * `stateSnapshot` walks every actor and every scene token, and the window
   * re-renders on every reconcile - so recomputing here made a dragged token
   * cost two full world walks a frame. The director hands its answer over on
   * the hook instead. **Scoped to the scene it was taken on**: a cached list
   * from the board before a scene change is a list of loops that are not there.
   */
  #cached = null;

  /** Take the reconciler's answer rather than walking the world again. */
  take(loops) {
    this.#cached = { sceneId: canvas?.scene?.id ?? null, loops: Array.isArray(loops) ? loops : [] };
    return this.#cached;
  }

  /** What exists on this board: the handed answer, or a fresh walk. */
  #loops() {
    if (this.#cached && this.#cached.sceneId === (canvas?.scene?.id ?? null)) return this.#cached.loops;
    return loopsFor(stateSnapshot());
  }

  /* -------------------------------------------- */
  /*  Drawing                                      */
  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isGM = game.user.isGM;
    // **`requireSettled: false`.** Sequencer's startup teardown lasts under
    // half a second and is nobody's business; a window that said *starting up*
    // would be saying it to a reader who will never see it.
    const availability = animationAvailability({ requireSettled: false });
    const loopsOn = animationLoopsEnabled();
    const stops = animationStops();
    const hidden = animationHidden();
    const loops = availability.ok ? this.#loops() : [];
    // **A CAST THIS CLIENT MAY NOT READ IS NOT LISTED EITHER** (D-729): the
    // window would otherwise name a spell whose card was hidden from this
    // reader, on a creature they can see, which is the leak the loop gate is
    // there to stop one step along.
    const rows = animationRows(loops, { stops, hidden, loopsOn, isGM, privateCasts: privateCasts() })
      .map(row => this.#row(row));

    // A GM whose Stop was made on another board still needs a Resume for it,
    // and the loop is not on this snapshot to be listed. Under *All scenes*
    // those keys are drawn too, saying plainly where they are.
    const here = new Set(rows.map(r => r.key));
    const elsewhere = isGM && this.#scope === "all"
      ? Object.entries(stops).filter(([key]) => !here.has(key)).map(([key, stop]) => this.#elsewhereRow(key, stop))
      : [];

    return Object.assign(context, {
      isGM,
      rows: [...rows, ...elsewhere],
      empty: rows.length || elsewhere.length ? null : game.i18n.localize("AZEROTH.Animation.Window.Empty"),
      // The one place a reader learns WHY nothing is listed: a missing module,
      // a switch they turned off, photosensitive mode. Never a blank window.
      unavailable: availability.ok ? null : game.i18n.localize(unavailableKey(availability.reason)),
      notDrawn: loopsOn ? null : game.i18n.localize("AZEROTH.Animation.State.NotDrawn"),
      scope: this.#scope,
      scopeLabel: game.i18n.localize("AZEROTH.Animation.Window.ScopeLabel"),
      scopes: Object.entries(SCOPES).map(([value, key]) => ({
        value, label: game.i18n.localize(key), selected: value === this.#scope
      })),
      canStopAll: isGM && rows.some(r => !r.stopped),
      canResumeAll: isGM && [...rows, ...elsewhere].some(r => r.stopped),
      canHideAll: loopsOn && rows.some(r => !r.hiddenHere && !r.stopped),
      canShowAll: rows.some(r => r.hiddenHere),
      gmOnly: game.i18n.localize("AZEROTH.Animation.Refuse.GMOnly")
    });
  }

  /**
   * One row as the template draws it.
   *
   * **Everything the row needs is spread ONTO the row** (D-609): a bare name
   * inside `{{#each}}` resolves against the row and not the root, so a control
   * keyed on the context would draw for everybody.
   */
  #row(row) {
    const isGM = game.user.isGM;
    const stopped = row.state === "stopped";
    return {
      key: row.key,
      name: row.name || row.identifier || game.i18n.localize("AZEROTH.Animation.Window.Unnamed"),
      binding: game.i18n.localize(AZEROTH.animationBindings[row.binding] ?? row.binding),
      where: this.#where(row.anchors),
      stopped,
      hiddenHere: row.state === "hidden",
      state: stopped
        ? game.i18n.format("AZEROTH.Animation.State.Stopped", { name: row.stoppedBy || game.i18n.localize("AZEROTH.Animation.Window.Unnamed") })
        : game.i18n.localize(AZEROTH.animationStates[row.state] ?? AZEROTH.animationStates.playing),
      canStop: isGM,
      canHide: row.canHide,
      // A greyed control says why in words beside it, never by the grey alone -
      // but TWO WORDS on the row (the lead, 2026-09-16). Six rows each printing
      // the whole sentence was noise rather than an explanation; the sentence
      // itself is said once, in the footer, beside the greyed Stop all.
      stopRefusal: isGM ? null : game.i18n.localize("AZEROTH.Animation.Refuse.GMOnlyShort"),
      elsewhere: false
    };
  }

  /** A stop whose loop is not on this board: the GM still needs a Resume. */
  #elsewhereRow(key, stop) {
    const sceneId = String(key).split(":")[4] ?? null;
    const scene = sceneId ? game.scenes?.get(sceneId) ?? null : null;
    return {
      key,
      name: scene?.name ?? game.i18n.localize("AZEROTH.Animation.Window.Unnamed"),
      binding: game.i18n.localize("AZEROTH.Animation.Window.Elsewhere"),
      where: "",
      stopped: true,
      hiddenHere: false,
      state: game.i18n.format("AZEROTH.Animation.State.Stopped", { name: stop?.by || game.i18n.localize("AZEROTH.Animation.Window.Unnamed") }),
      canStop: game.user.isGM,
      canHide: false,
      stopRefusal: game.user.isGM ? null : game.i18n.localize("AZEROTH.Animation.Refuse.GMOnlyShort"),
      elsewhere: true
    };
  }

  /**
   * What a loop is bound to, by name: the creatures, or the ground it sits on.
   * `getListFormatter` is core's own, as the loot offer uses it - never a
   * hand-written comma, which is a string with no lang key behind it.
   */
  #where(anchors) {
    const scene = canvas?.scene ?? null;
    const names = (anchors ?? [])
      .map(id => scene?.tokens?.get(id)?.name ?? scene?.regions?.get(id)?.name ?? null)
      .filter(Boolean);
    if (!names.length) return "";
    return game.i18n.format("AZEROTH.Animation.Window.On", { names: game.i18n.getListFormatter().format(names) });
  }

  /* -------------------------------------------- */
  /*  Controls                                     */
  /* -------------------------------------------- */

  /**
   * @inheritDoc
   *
   * **The scope select carries `data-animations-scope` and NO `data-action`**
   * (D-677): the actions map fires on CLICK, and a select that changed on a
   * click would fire before the reader had chosen anything.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const select = this.element?.querySelector?.("[data-animations-scope]");
    select?.addEventListener("change", event => {
      this.#scope = event.target.value === "all" ? "all" : "scene";
      this.render();
    });
  }

  /** The key of the row a control sits on. */
  static #keyOf(target) {
    return target?.closest?.("[data-loop-key]")?.dataset?.loopKey ?? null;
  }

  static async #onStop(event, target) {
    const key = AzerothAnimations.#keyOf(target);
    if (!key || !game.user.isGM) return null;
    return setAnimationStops(withKey(animationStops(), key, {
      by: game.user.name, userId: game.user.id, at: Date.now()
    }));
  }

  static async #onResume(event, target) {
    const key = AzerothAnimations.#keyOf(target);
    if (!key || !game.user.isGM) return null;
    return setAnimationStops(withoutKey(animationStops(), key));
  }

  static async #onHide(event, target) {
    const key = AzerothAnimations.#keyOf(target);
    if (!key) return null;
    return setAnimationHidden(withKey(animationHidden(), key, true));
  }

  static async #onShow(event, target) {
    const key = AzerothAnimations.#keyOf(target);
    if (!key) return null;
    return setAnimationHidden(withoutKey(animationHidden(), key));
  }

  /**
   * Every loop on this board at once. One write, not one per row.
   *
   * **The scope select does not reach this, and the select's label says so.**
   * `loopsFor` reads the viewed scene, so a loop on another board is not in
   * this window's list and there is no key to stop. Resume is the asymmetric
   * one, because a stop is a key the world already holds.
   *
   * `this` is the application: AppV2 calls an action handler with the instance
   * bound, which is why a static handler may reach a private instance member.
   */
  static async #onStopAll() {
    if (!game.user.isGM) return null;
    let stops = animationStops();
    for (const key of this.#listedKeys()) {
      stops = withKey(stops, key, { by: game.user.name, userId: game.user.id, at: Date.now() });
    }
    return setAnimationStops(stops);
  }

  /**
   * Resume everything. **Under *All scenes* this clears the map whole**, which
   * is the only way back for a stop made on a board the GM has left.
   */
  static async #onResumeAll() {
    if (!game.user.isGM) return null;
    if (this.#scope === "all") return setAnimationStops({});
    let stops = animationStops();
    for (const key of this.#listedKeys()) stops = withoutKey(stops, key);
    return setAnimationStops(stops);
  }

  static async #onHideAll() {
    let hidden = animationHidden();
    for (const key of this.#listedKeys()) hidden = withKey(hidden, key, true);
    return setAnimationHidden(hidden);
  }

  /** A player's screen is one screen: Show all clears the whole map. */
  static async #onShowAll() {
    return setAnimationHidden({});
  }

  /**
   * The loop keys on this board right now.
   *
   * Read FRESH rather than off the cache: a press is a decision about the world
   * as it is at the moment of the press, and the cache is only as new as the
   * last reconcile the hook announced.
   */
  #listedKeys() {
    if (!animationAvailability({ requireSettled: false }).ok) return [];
    return loopsFor(stateSnapshot()).map(loop => loop.key);
  }
}

/** The one instance. */
let win = null;

/** The window, made if it has never been opened. */
function windowFor() {
  if (!win) win = new AzerothAnimations();
  return win;
}

/** Open it. The Token control's tool and `game.system.azeroth.animations.open`. */
export function openAnimations() {
  return windowFor().render({ force: true });
}

/**
 * Keep it in step with the world.
 *
 * **NEVER GUARDED ON `rendered`** (the loot offer's lesson): the state is
 * RENDERING for the whole of `_replaceHTML`, so a guarded re-render that
 * arrived while one was in flight would be silently dropped - and a stop
 * arrives in exactly that shape, because the write that causes it also causes
 * the reconcile whose hook lands next. An unforced render on a window that has
 * never been opened returns early in core, so this is safe from init.
 */
export function registerAnimationWindowHooks() {
  // The reconciler HANDS OVER what it worked out, and fires only on a change
  // (see `director.mjs`): the window neither re-renders on a pass that moved
  // nothing nor walks every actor and every scene token a second time to draw
  // a list the director has just built. The second argument is everything the
  // world implies, stops and hides included, because a stopped loop is still a
  // row here - saying who stopped it.
  Hooks.on("azerothAnimationsReconciled", (wanted, loops) => {
    win?.take(loops ?? wanted ?? []);
    win?.render();
  });
  for (const hook of ["azerothAnimationStops", "azerothAnimationHidden", "azerothAnimationSettings", "canvasReady"]) {
    Hooks.on(hook, () => win?.render());
  }
}
