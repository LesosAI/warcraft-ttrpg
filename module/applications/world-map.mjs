/**
 * The world map (D-680). The Forge's shape over `rules/regions.mjs` and
 * `rules/map-geometry.mjs`: an `ApplicationV2` whose law is a pure module, a
 * private `#state` that survives renders, `#load()` reading its data once,
 * `_onRender` binding `change` on the window's `data-map` controls, and an
 * `apply(state)` a test drives without clicking. CLAUDE.md §5: copy that
 * before inventing a sixth pattern.
 *
 * **It is a window, not a scene.** Scene Regions were the obvious home and
 * cannot do this job: v14 hard-codes the highlight at `alpha = 0.5` on a
 * private field, hatches the fill for anyone not controlling it, renders a
 * flat tint that cannot animate, masks the whole layer behind a non-GM's
 * vision, and only accepts a click while the Regions control is active. An
 * inline canvas over the plate gives arbitrary opacity, animation, clicks
 * from anywhere, and no vision trap.
 *
 * **Who holds a region is a world setting, and that is the whole
 * synchronisation story.** A world setting is a real Setting document, so a
 * GM's write broadcasts and every client's `onChange` re-renders this window.
 * No socket, and no `CONFIG.queries` — only a GM changes control, and core
 * already refuses a player a world setting.
 *
 * The regions are not drawn. Each is a SEED POINT and the ground goes to
 * whichever seed is nearest, masked to the land the plate itself shows, so
 * the coastline is pixel-accurate and nobody had to trace it. See
 * `rules/map-geometry.mjs` for why, and `region-shapes.json` to move one.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { AZEROTH } from "../config.mjs";
import { mapState, setMapState } from "../settings.mjs";
import { worldChapterNamed } from "./rules-journals.mjs";
import shapes from "../rules/region-shapes.json" with { type: "json" };
import {
  areaShares, assignOwners, borderMask, landMask, ownerAtPoint, regionBounds
} from "../rules/map-geometry.mjs";
import {
  CONTINENTS, CONTROLS, FIELDS,
  controlOf, exposureFor, isFieldVisible, isOverridden, isRegionVisible,
  isSettlementVisible, linkOf, noteOf, partyExposure, pinnedSettlements,
  regionOf, regionsOn, regionsVisibleTo, setControl, setFieldVisible,
  setHideByDefault, setLink, setNote, setParty, setRegionVisible,
  setAllSettlementsVisible, setSettlementLink, setSettlementVisible, settlementLink, tally
} from "../rules/regions.mjs";

const TEMPLATE = "systems/azeroth-rpg/templates/map/world-map.hbs";

/**
 * NOTHING IS DRAWN ON THE PLATE AT REST (the lead, 2026-09-08). The art is
 * the point of it, and a permanent partition over the top competes with the
 * thing it is drawn on. Only the region under the cursor lights, and the
 * selected one stays lit; every other carrier of control is off the plate —
 * the flag on each row of the list, the word in the panel, the legend.
 */
const HOVER_ALPHA = 0.30;
const SELECTED_ALPHA = 0.42;

/**
 * How wide a lit region's edge is drawn, as a fraction of the plate's width.
 *
 * **Never a pixel count.** It was 2, tuned against the 828px plates, and 2
 * pixels of a 3264px plate is a quarter of that on screen — sub-pixel at the
 * fit zoom, which is the fault that made the whole partition invisible the
 * first time round. The ratio is what was tuned, so the ratio is what is
 * stored, and the border looks the same on any art (D-684).
 */
const BORDER_RATIO = 2 / 828;

/** The border for one plate, in that plate's own pixels. */
const borderFor = width => Math.max(1, Math.round(BORDER_RATIO * width));

/**
 * Zoom limits and the step a click of the wheel takes.
 *
 * There is no fixed floor: the plate is drawn at the frame's width, so a
 * continent taller than it is wide runs off the bottom at 1. The floor is
 * whatever shows the WHOLE plate, worked out per frame — which is also where
 * Fit goes, so the button does what it says.
 */
const ZOOM = { max: 8, step: 1.2 };

/** Fallbacks only. The colours themselves live in `styles/_tokens.scss`. */
const FALLBACK = { alliance: "#1c4587", horde: "#8b1a1a", neutral: "#4a443a" };

/** `#1c4587` to `[28, 69, 135]`. */
function rgbOf(css) {
  const hex = String(css ?? "").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const parts = /rgba?\(([^)]+)\)/i.exec(hex);
  if (parts) return parts[1].split(",").slice(0, 3).map(v => Number(v.trim()) || 0);
  return [0, 0, 0];
}

export class AzerothWorldMap extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "azeroth-world-map",
    classes: ["azeroth", "azeroth-world-map"],
    tag: "div",
    window: { title: "AZEROTH.Map.Title", resizable: true, icon: "fa-solid fa-map-location-dot" },
    // The plates are 3264px wide, so the art holds far more than any frame
    // shows at once: the window opens as large as it reasonably can and
    // `Wide` gives the whole of it to the plate (D-684).
    position: { width: 1400, height: 900 },
    actions: {
      mapContinent: AzerothWorldMap.#onContinent,
      mapSelect: AzerothWorldMap.#onSelect,
      mapSetControl: AzerothWorldMap.#onSetControl,
      mapMoveParty: AzerothWorldMap.#onMoveParty,
      mapClearParty: AzerothWorldMap.#onClearParty,
      mapReadEntry: AzerothWorldMap.#onReadEntry,
      mapReset: AzerothWorldMap.#onReset,
      mapZoomIn: AzerothWorldMap.#onZoomIn,
      mapZoomOut: AzerothWorldMap.#onZoomOut,
      mapZoomFit: AzerothWorldMap.#onZoomFit,
      mapToggleWide: AzerothWorldMap.#onToggleWide,
      mapToggleEdit: AzerothWorldMap.#onToggleEdit,
      mapTogglePreview: AzerothWorldMap.#onTogglePreview,
      mapShowRegion: AzerothWorldMap.#onShowRegion,
      mapShowField: AzerothWorldMap.#onShowField,
      mapShowSettlement: AzerothWorldMap.#onShowSettlement,
      mapShowAllSettlements: AzerothWorldMap.#onShowAllSettlements,
      mapMarkSettlement: AzerothWorldMap.#onMarkSettlement,
      mapClearPin: AzerothWorldMap.#onClearPin,
      mapOpenLink: AzerothWorldMap.#onOpenLink,
      mapOpenPin: AzerothWorldMap.#onOpenPin
    }
  };

  static PARTS = { body: { template: TEMPLATE, scrollable: [".azeroth-map-panel", ".azeroth-map-list"] } };

  /** What this client is looking at. Survives a render; never written to the world. */
  #local = {
    continent: "eastern-kingdoms",
    selected: null,
    hovered: null,
    // The GM's two switches: whether the configuration controls are
    // showing, and whether to look at the map as a player would.
    editing: false,
    preview: false,
    // Gives the whole window to the plate. The art carries more detail than
    // the frame can show, so every pixel the side columns give back is
    // detail the reader actually gets.
    wide: false,
    // The settlement waiting for a click on the plate to place its pin.
    placing: null
  };

  /**
   * Zoom and pan, per continent so switching back does not lose the view.
   * Applied as a transform in `_onRender` and mutated DIRECTLY on drag — a
   * re-render a frame would repaint the region layers for nothing.
   */
  #view = { "eastern-kingdoms": { zoom: 1, x: 0, y: 0 }, kalimdor: { zoom: 1, x: 0, y: 0 } };

  /** Per continent: the plate, its land mask, and who owns each pixel. */
  #plates = new Map();

  /**
   * The paint in flight. `_onRender` cannot await — core does not await it —
   * so a test that screenshots or measures straight after a render catches a
   * blank canvas. `ready()` is the seam; nothing else uses it.
   */
  #painting = Promise.resolve();

  /** True while a deferred `#applyView` is queued behind the plate's layout. */
  #awaitingLayout = false;

  /**
   * Resolves once the plate is decoded, the partition is on the canvas and the
   * pins are placed.
   *
   * **AWAITING `#painting` ONCE IS NOT ENOUGH.** Work scheduled while we are
   * waiting replaces it: a second render (a world setting's `onChange` reaches
   * this client a beat after the write) assigns a fresh paint AND replaces the
   * pin elements, and `#applyView` extends it again when the plate has not
   * laid out. Awaiting the promise we first read leaves all of that
   * uncovered — the markers were still unpositioned when the caller looked,
   * intermittently, which is the worst way for it to be wrong (D-684).
   *
   * So await until the promise stops changing. Bounded, because a window that
   * re-renders forever is a bug of its own and hanging on it helps nobody.
   */
  async ready() {
    for (let i = 0; i < 8; i++) {
      const seen = this.#painting;
      await seen;
      if (seen === this.#painting) break;
    }
    return this;
  }

  /**
   * How much of the continent each region took, worst first.
   *
   * The one number that says a seed is misplaced without anybody looking at
   * the map: a region holding NOTHING has its seed in the sea or inside
   * another region's ground. The boundary editor prints this and so does the
   * Quench batch, so a bad seed fails a test rather than waiting to be noticed.
   */
  async shares(continent = this.#local.continent) {
    const plate = await this.#plate(continent);
    if (!plate || plate.missing) return [];
    return areaShares(plate.owners, plate.seeds)
      .map(s => ({ ...s, name: regionOf(s.key)?.name ?? s.key }))
      .sort((a, b) => a.share - b.share);
  }

  /* -------------------------------------------- */
  /*  State                                        */
  /* -------------------------------------------- */

  /** The world's state — who holds what, where the company is, the log. */
  get world() {
    return mapState();
  }

  /** What this client is looking at, for a test. */
  get state() {
    return { ...this.#local };
  }

  /**
   * Drive the window without clicking, the way the other five are driven.
   * Local keys move the view; world keys are written to the setting.
   */
  async apply({
    continent = null, selected = null, control = null, party = undefined, note = null,
    editing = null, preview = null, wide = null, hideByDefault = null,
    showRegion = null, showField = null, showSettlement = null, link = null, settlement = null
  } = {}) {
    if (continent && CONTINENTS.includes(continent)) this.#local.continent = continent;
    if (selected !== null) this.#local.selected = regionOf(selected) ? selected : null;

    let world = null;
    if (control) world = setControl(world ?? this.world, control.key, control.control, { by: game.user?.id ?? null });
    if (party !== undefined) world = setParty(world ?? this.world, party);
    if (note) world = setNote(world ?? this.world, note.key, note.text);
    if (editing !== null) this.#local.editing = Boolean(editing);
    if (wide !== null) this.#local.wide = Boolean(wide);
    if (preview !== null) this.#local.preview = Boolean(preview);
    if (hideByDefault !== null) world = setHideByDefault(world ?? this.world, hideByDefault);
    if (showRegion) world = setRegionVisible(world ?? this.world, showRegion.key, showRegion.shown);
    if (showField) world = setFieldVisible(world ?? this.world, showField.key, showField.field, showField.shown);
    if (showSettlement) {
      world = setSettlementVisible(world ?? this.world, showSettlement.key, showSettlement.name, showSettlement.shown);
    }
    if (link) world = setLink(world ?? this.world, link.key, link.patch ?? {});
    if (settlement) {
      world = setSettlementLink(world ?? this.world, settlement.key, settlement.name, settlement.patch ?? {});
    }
    // ALWAYS render, and await it. Writing the setting fires `onChange`, which
    // renders every open map — but that call is not awaited and cannot be, so
    // relying on it makes `apply` a race: a call carrying both `selected` and
    // `party` was screenshotted with the party set and the selection missing,
    // while a call carrying `selected` alone (which took the awaited branch)
    // was correct. `apply` leaves the window showing what was applied.
    if (world) await setMapState(world);
    if (this.rendered) await this.render();
    // `wide` closes the side columns, which changes the frame the fit was
    // worked out against.
    // AFTER A PAINT, not straight after `render()`: the fit is measured off
    // the frame, and the new grid has not been laid out when the render's
    // promise resolves.
    if (wide !== null && this.rendered) {
      await this.ready();
      await new Promise(resolve => requestAnimationFrame(resolve));
      this.#refit();
    }
    return this.state;
  }

  /* -------------------------------------------- */
  /*  The plate                                    */
  /* -------------------------------------------- */

  /**
   * Read a plate once: decode it, mask the land off its own sea colour, and
   * give every land pixel to its nearest seed. About a second the first time
   * a continent is opened and nothing thereafter.
   */
  async #plate(continent) {
    if (this.#plates.has(continent)) return this.#plates.get(continent);
    const meta = shapes.plates[continent];
    if (!meta) return null;

    const image = await new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = meta.src;
    });
    if (!image) {
      // A missing plate must never be a broken window: the list and the panel
      // work without it, and the map area says what is wrong.
      const empty = { continent, meta, missing: true };
      this.#plates.set(continent, empty);
      return empty;
    }

    const width = image.naturalWidth || meta.width;
    const height = image.naturalHeight || meta.height;
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);

    const seeds = regionsOn(continent)
      .filter(r => shapes.seeds[r.key])
      .map(r => ({ key: r.key, x: shapes.seeds[r.key][0], y: shapes.seeds[r.key][1] }));
    // The seeds go IN, so the size filter cannot take an island a region
    // stands on — the Isle of Quel'Danas is smaller than some of the noise.
    const land = landMask({ data, width, height }, { exclude: meta.exclude ?? [], keep: seeds });
    const owners = assignOwners({ width, height, land, seeds });
    const borders = borderMask(owners, width, height, borderFor(width));
    // One box a region, so lighting the one under the cursor repaints its own
    // corner rather than the whole million-pixel plate.
    const bounds = regionBounds(owners, seeds.length, width, height);

    // `land` is NOT kept. `owners` already says it — a pixel is ground exactly
    // when its owner is not -1 — and at 3264px the mask is 21MB a plate, held
    // for the life of the window for nothing (D-684).
    const plate = { continent, meta, image, width, height, seeds, owners, borders, bounds, missing: false };
    this.#plates.set(continent, plate);
    return plate;
  }

  /** The faction colours, read off the stylesheet so `_tokens.scss` stays the source. */
  #colours() {
    const style = this.element ? getComputedStyle(this.element) : null;
    const read = (name, fallback) => {
      const value = style?.getPropertyValue(name)?.trim();
      return rgbOf(value || fallback);
    };
    return {
      alliance: read("--azeroth-alliance-blue", FALLBACK.alliance),
      horde: read("--azeroth-horde-red", FALLBACK.horde),
      neutral: read("--azeroth-ink-soft", FALLBACK.neutral)
    };
  }

  /* -------------------------------------------- */
  /*  Context                                      */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const world = this.world;
    const continent = this.#local.continent;
    const isGM = Boolean(game.user?.isGM);
    // PREVIEW IS THE POINT of granular hiding: a GM cannot check what a player
    // sees by reading a list of switches. Everything below reads `asGM`, so
    // one toggle shows the map through a player's eyes.
    const asGM = isGM && !this.#local.preview;
    const editing = isGM && this.#local.editing;

    const list = regionsVisibleTo(world, { isGM: asGM, continent })
      .map(region => this.#row(region, world, { asGM, editing }));

    const chosen = this.#local.selected;
    const selected = (chosen && (asGM || isRegionVisible(world, chosen)))
      ? this.#row(regionOf(chosen), world, { full: true, asGM, editing })
      : null;

    const counts = tally(world);
    return {
      ...context,
      isGM,
      asGM,
      editing,
      preview: this.#local.preview,
      wide: this.#local.wide,
      hideByDefault: world.hideByDefault,
      placing: this.#local.placing,
      continent,
      continents: CONTINENTS.map(key => ({
        key,
        label: game.i18n.localize(`AZEROTH.Map.Continent.${key}`),
        active: key === continent
      })),
      plate: shapes.plates[continent],
      pins: pinnedSettlements(world, { continent, isGM: asGM }).map(pin => ({
        ...pin,
        classLabel: game.i18n.localize(AZEROTH.settlementClasses[pin.class] ?? pin.class),
        // Normalised; `#applyView` turns these into viewport pixels, because
        // the pins live outside the stage and do not travel with it on their
        // own.
        x: pin.pin[0],
        y: pin.pin[1]
      })),
      regions: list,
      selected,
      // Bounded choices, so a `<select>` rather than a search (the lead).
      scenes: game.scenes?.map(s => ({ uuid: s.uuid, name: s.name })) ?? [],
      journals: game.journal?.map(j => ({ uuid: j.uuid, name: j.name })) ?? [],
      controls: CONTROLS.map(key => ({ key, label: game.i18n.localize(AZEROTH.control[key]) })),
      legend: CONTROLS.map(key => ({
        key,
        label: game.i18n.localize(AZEROTH.control[key]),
        count: counts[key],
        holds: game.i18n.format("AZEROTH.Map.Holds", { n: counts[key] })
      })),
      party: this.#partyPanel(world, asGM),
      partyKey: world.party,
      history: asGM
        ? [...world.history].reverse().slice(0, 12).map(row => ({
          ...row,
          label: game.i18n.format("AZEROTH.Map.Changed", {
            name: row.name,
            from: game.i18n.localize(AZEROTH.control[row.from] ?? row.from),
            to: game.i18n.localize(AZEROTH.control[row.to] ?? row.to)
          })
        }))
        : []
    };
  }

  /**
   * Where the company is and what the ground is doing to them. This is the
   * one thing feeding config's EXPOSURE_OCCASIONS, which has been shaped to
   * take a region's taint grade since it was written and has never had a
   * region to take it from.
   */
  #partyPanel(world, asGM = true) {
    const exposure = partyExposure(world);
    if (!exposure) return null;
    // A player is not told what the ground is doing where the taint is hidden.
    if (!asGM && !isFieldVisible(world, exposure.region.key, "taint")) return null;
    const track = game.i18n.localize(AZEROTH.corruptionTracks[exposure.track] ?? exposure.track);
    return {
      ...exposure,
      trackLabel: track,
      label: exposure.where
        ? game.i18n.format("AZEROTH.Map.ExposureWhere", { dc: exposure.dc, track, where: exposure.where })
        : game.i18n.format("AZEROTH.Map.Exposure", { dc: exposure.dc, track })
    };
  }

  /** One region, for the list and for the panel. */
  #row(region, world, { full = false, asGM = true, editing = false } = {}) {
    if (!region) return null;
    const control = controlOf(world, region.key);
    const sees = field => asGM || isFieldVisible(world, region.key, field);
    const showControl = sees("control");

    const row = {
      key: region.key,
      name: region.name,
      control,
      showControl,
      controlLabel: game.i18n.localize(AZEROTH.control[control]),
      overridden: isOverridden(world, region.key),
      selected: region.key === this.#local.selected,
      here: region.key === world.party,
      hidden: !isRegionVisible(world, region.key),
      tier: sees("threat") ? region.threat.tier : null,
      threat: !sees("threat")
        ? ""
        : (region.threat.tier === null
          ? game.i18n.localize("AZEROTH.Map.Unrated")
          : game.i18n.format("AZEROTH.Map.Tier", { tier: region.threat.tier })),
      tainted: sees("taint") && region.taint.grades.length > 0
    };
    if (!full) return row;

    const exposure = exposureFor(region.key);
    const link = linkOf(world, region.key);
    const settlements = region.settlements
      .filter(s => asGM || isSettlementVisible(world, region.key, s.name))
      .map(s => {
        const mark = settlementLink(world, region.key, s.name);
        return {
          ...s,
          classLabel: game.i18n.localize(AZEROTH.settlementClasses[s.class] ?? s.class),
          trainersLabel: s.trainers.length ? s.trainers.join(", ") : game.i18n.localize("AZEROTH.Map.NoTrainers"),
          shown: isSettlementVisible(world, region.key, s.name),
          pinned: Boolean(mark.pin),
          placing: this.#local.placing?.key === region.key && this.#local.placing?.name === s.name,
          scene: mark.scene ?? "",
          journal: mark.journal ?? "",
          sceneName: mark.scene ? (fromUuidSync(mark.scene)?.name ?? null) : null,
          journalName: mark.journal ? (fromUuidSync(mark.journal)?.name ?? null) : null
        };
      });

    return {
      ...row,
      controlOptions: CONTROLS.map(key => ({
        key,
        label: game.i18n.localize(AZEROTH.control[key]),
        active: key === control
      })),
      hook: region.hook,
      showThreat: sees("threat"),
      showWeightClass: sees("weightClass"),
      showTaint: sees("taint"),
      showHeldBy: sees("heldBy"),
      showWaysIn: sees("waysIn"),
      threatText: region.threat.text,
      weightClass: region.weightClass.text,
      taintText: region.taint.text,
      heldByText: region.heldBy.text,
      taint: sees("taint")
        ? exposure.grades.map(g => ({
          ...g,
          trackLabel: game.i18n.localize(AZEROTH.corruptionTracks[g.track] ?? g.track),
          label: g.where
            ? game.i18n.format("AZEROTH.Map.ExposureWhere", {
              dc: g.dc, track: game.i18n.localize(AZEROTH.corruptionTracks[g.track] ?? g.track), where: g.where
            })
            : game.i18n.format("AZEROTH.Map.Exposure", {
              dc: g.dc, track: game.i18n.localize(AZEROTH.corruptionTracks[g.track] ?? g.track)
            })
        }))
        : [],
      roads: sees("waysIn")
        ? region.waysIn
          .filter(way => asGM || isRegionVisible(world, way.key))
          .map(way => ({
            ...way,
            control: controlOf(world, way.key),
            showControl: asGM || isFieldVisible(world, way.key, "control"),
            label: way.bearing ? `${way.name} — ${way.bearing}` : way.name
          }))
        : [],
      settlements,
      note: noteOf(world, region.key),
      // What the region itself opens.
      scene: link.scene ?? "",
      journal: link.journal ?? "",
      sceneName: link.scene ? (fromUuidSync(link.scene)?.name ?? null) : null,
      journalName: link.journal ? (fromUuidSync(link.journal)?.name ?? null) : null,
      // The per-field switches, only built when the GM is configuring.
      fieldSwitches: editing
        ? FIELDS.map(field => ({
          field,
          label: game.i18n.localize(`AZEROTH.Map.Field.${field}`),
          shown: isFieldVisible(world, region.key, field)
        }))
        : []
    };
  }

  /* -------------------------------------------- */
  /*  Render                                       */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);

    // Every `data-map` control emits `change` and re-renders. NO
    // `data-action` on an input: an action fires on click alone, so a
    // textarea wired that way would look connected and save nothing.
    for (const el of this.element.querySelectorAll("[data-map]")) {
      el.addEventListener("change", () => this.#readForm(el));
    }

    this.#bindPlate();
    // POSITION THE PINS NOW, not only inside the async paint. A render
    // replaces the pin elements with fresh ones carrying no inline position,
    // and `#paint` repositions them a tick later — so anything that looked
    // between the two saw every marker stacked in the plate's top-left
    // corner. `ready()` did not cover it, because the render that replaced
    // them was not the one being awaited. The stage is already laid out by
    // then on every render but the first, and `#applyView` defers itself when
    // it is not (D-684).
    // AFTER the paint is assigned, not before. `#applyView` defers itself by
    // chaining onto `#painting` when the stage has no height yet, and calling
    // it first meant the very next line threw that chain away — so `ready()`
    // stopped covering the reposition it was supposed to wait for.
    this.#painting = this.#paint();
    this.#applyView();
  }

  /** Draw the fills, the borders and the selected region's accent. */
  async #paint() {
    const plate = await this.#plate(this.#local.continent);
    if (!plate || plate.missing || !this.element) return;

    for (const cls of [".azeroth-map-hot", ".azeroth-map-accent", ".azeroth-map-base"]) {
      const el = this.element.querySelector(cls);
      if (el && "width" in el) {
        el.width = plate.width;
        el.height = plate.height;
      }
    }
    await this.#laidOut();
    this.#applyView();
    this.#light(".azeroth-map-accent", plate, this.#local.selected, SELECTED_ALPHA);
    this.#light(".azeroth-map-hot", plate, this.#local.hovered, HOVER_ALPHA);
  }

  /**
   * Wait until the plate's `<img>` has given the stage a height.
   *
   * **AN IMAGE THAT HAS NOT LOADED IS FULL WIDTH AND ZERO TALL.** The stage
   * takes its height from that image, and everything geometric here reads
   * `stage.offsetHeight`: `#applyView` puts every pin at `y * height`, which
   * is 0 for all of them, and `#fitZoom` gives up and returns 1. The pins then
   * sit in a row along the top of the plate — the horizontal half is right,
   * because the width is known from the moment the element exists (D-684).
   *
   * It was survivable at 0.2MB a plate and is not at 6.4MB. `#plate()` has
   * already decoded the same URL, so this is usually the cache and one frame.
   */
  async #laidOut() {
    const img = this.element?.querySelector(".azeroth-map-image");
    if (!img) return;
    if (!img.complete || !img.naturalHeight) {
      // BOUNDED. `ready()` awaits this through `#painting`, so a promise that
      // never settles is a test that hangs rather than fails. `#plate()` has
      // already fetched this URL and refused a missing one, so the wait is
      // normally a cached frame and the ceiling never comes near.
      await new Promise(resolve => {
        const timer = setTimeout(done, 15000);
        function done() {
          clearTimeout(timer);
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        }
        img.addEventListener("load", done);
        img.addEventListener("error", done);
      });
    }
    // `load` fires before the layout it causes, so give the box a frame to
    // exist before anything measures it.
    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  /**
   * Paint ONE region onto a layer, and nothing else on it.
   *
   * Bounded to that region's own box: a plate is over a million pixels and
   * this runs on every mouse move.
   */
  #light(selector, plate, key, alpha) {
    const canvas = this.element?.querySelector(selector);
    if (!canvas?.getContext) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, plate.width, plate.height);
    if (!key) return;

    const index = plate.seeds.findIndex(seed => seed.key === key);
    if (index < 0) return;
    const box = plate.bounds[index];
    if (!box) return;

    const [r, g, b] = this.#colours()[controlOf(this.world, key)] ?? this.#colours().neutral;
    const w = (box.x1 - box.x0) + 1;
    const h = (box.y1 - box.y0) + 1;
    const layer = ctx.createImageData(w, h);
    const flat = Math.round(255 * alpha);
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const p = (y * plate.width) + x;
        if (plate.owners[p] !== index) continue;
        const i = ((((y - box.y0) * w) + (x - box.x0))) * 4;
        layer.data[i] = r;
        layer.data[i + 1] = g;
        layer.data[i + 2] = b;
        // D5 §8: the edge is what survives a glance and greyscale, so a lit
        // region is outlined as well as washed.
        layer.data[i + 3] = plate.borders[p] === 1 ? 255 : flat;
      }
    }
    ctx.putImageData(layer, box.x0, box.y0);
  }

  /* -------------------------------------------- */
  /*  Zoom and pan                                 */
  /* -------------------------------------------- */

  /** This continent's view. */
  get #v() {
    return (this.#view[this.#local.continent] ??= { zoom: 1, x: 0, y: 0 });
  }

  /**
   * The scale that shows the whole plate inside the frame.
   *
   * The stage is laid out at the frame's WIDTH, so a plate twice as tall as it
   * is wide is twice the frame's height at scale 1 and its foot is off the
   * bottom. Opening at 1 is deliberate — it is the most detail the art has to
   * give — and Fit goes here instead.
   */
  #fitZoom() {
    const viewport = this.element?.querySelector(".azeroth-map-viewport");
    const stage = this.element?.querySelector(".azeroth-map-stage");
    if (!viewport || !stage?.offsetHeight) return 1;
    return Math.min(1, viewport.getBoundingClientRect().height / stage.offsetHeight);
  }

  /**
   * Push the view onto the stage as a transform.
   *
   * Written straight to the element rather than through a render: a render a
   * frame would repaint the lit region for nothing, and panning would crawl.
   */
  #applyView() {
    const stage = this.element?.querySelector(".azeroth-map-stage");
    if (!stage) return;
    const v = this.#v;
    stage.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    // THE PINS ARE OUTSIDE THE STAGE, so nothing scales them and a marker is
    // the same size on screen at every zoom. The cost is that they do not
    // travel with the plate on their own, so their place is worked out here.
    //
    // They were inside it first, counter-scaled. That could not be made to
    // stick: `scale(calc(1 / var(--zoom)))` in CSS never re-resolved when the
    // property changed, and setting the same transform inline was accepted,
    // stored, serialised back correctly - and the computed matrix still came
    // out as the translate alone, at both zooms, to six decimal places. Two
    // probes said the same thing. Taking the pins out of the scaled box
    // removes the argument rather than winning it.
    const w = stage.offsetWidth * v.zoom;
    const h = stage.offsetHeight * v.zoom;
    // A stage with no height means the plate has not laid out yet. Positioning
    // against it puts every pin at `y * 0`; SKIPPING leaves them with no
    // inline position at all, which stacks them in the container's corner
    // instead — the same fault wearing different clothes. So do neither:
    // come back when the image has arrived. `#paint` already waits, but
    // `#applyView` is called from the drag, the wheel, the zoom buttons and
    // the refit as well, and any one of them can be the last word before a
    // reader (or a test) looks.
    if (h > 0) {
      for (const pin of this.element.querySelectorAll(".azeroth-map-pin")) {
        pin.style.left = `${v.x + (Number(pin.dataset.x) * w)}px`;
        pin.style.top = `${v.y + (Number(pin.dataset.y) * h)}px`;
      }
    } else if (!this.#awaitingLayout) {
      this.#awaitingLayout = true;
      this.#painting = this.#painting
        .then(() => this.#laidOut())
        .then(() => {
          this.#awaitingLayout = false;
          if (this.element) this.#applyView();
        });
    }
    const out = this.element.querySelector('[data-action="mapZoomOut"]');
    const inn = this.element.querySelector('[data-action="mapZoomIn"]');
    if (out) out.disabled = v.zoom <= this.#fitZoom() + 0.001;
    if (inn) inn.disabled = v.zoom >= ZOOM.max - 0.001;
  }

  /**
   * Zoom about a point, so the plate grows under the cursor rather than away
   * from it. `at` is in viewport pixels; omit it to zoom about the centre.
   */
  #zoomBy(factor, at = null) {
    const viewport = this.element?.querySelector(".azeroth-map-viewport");
    if (!viewport) return;
    const v = this.#v;
    const next = Math.min(ZOOM.max, Math.max(this.#fitZoom(), v.zoom * factor));
    if (next === v.zoom) return;
    const box = viewport.getBoundingClientRect();
    const px = at ? at.x - box.left : box.width / 2;
    const py = at ? at.y - box.top : box.height / 2;
    // Keep the point under the cursor fixed.
    v.x = px - (((px - v.x) / v.zoom) * next);
    v.y = py - (((py - v.y) / v.zoom) * next);
    v.zoom = next;
    this.#clampView();
    this.#applyView();
  }

  /** Never let the plate be dragged away from the frame entirely. */
  #clampView() {
    const viewport = this.element?.querySelector(".azeroth-map-viewport");
    const stage = this.element?.querySelector(".azeroth-map-stage");
    if (!viewport || !stage) return;
    const v = this.#v;
    const frame = viewport.getBoundingClientRect();
    const w = stage.offsetWidth * v.zoom;
    const h = stage.offsetHeight * v.zoom;
    v.x = w <= frame.width ? (frame.width - w) / 2 : Math.min(0, Math.max(frame.width - w, v.x));
    v.y = h <= frame.height ? Math.max(0, (frame.height - h) / 2) : Math.min(0, Math.max(frame.height - h, v.y));
  }

  /**
   * The frame has changed size, so the view goes back to the fit.
   *
   * `#fitZoom` is a ratio of the frame's height to a stage laid out at its
   * WIDTH, so a wider frame has a SMALLER fit — a zoom that showed the whole
   * plate a moment ago runs off the bottom the instant the side columns close.
   * Keeping the reader's zoom across that change was tried and does not
   * survive the layout not having happened yet when the arithmetic runs; going
   * back to the fit is one line, always right, and is what a reader opening
   * the map wide is asking for anyway.
   */
  #refit() {
    this.#resetView();
  }

  /** Back to the whole plate, all of it in the frame. */
  #resetView() {
    this.#view[this.#local.continent] = { zoom: this.#fitZoom(), x: 0, y: 0 };
    this.#clampView();
    this.#applyView();
  }

  /**
   * Which region a point on the plate falls in, or null for the sea.
   *
   * Public because the Quench batch asks it of every seed: a seed that does
   * not resolve to its own region has had the ground taken out from under it
   * by the sea mask, which is invisible on the painted map.
   */
  async regionAtPoint(event) {
    const plate = await this.#plate(this.#local.continent);
    if (!plate || plate.missing) return null;
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const owner = ownerAtPoint(
      plate.owners, plate.width, plate.height,
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height
    );
    return owner < 0 ? null : plate.seeds[owner].key;
  }

  /**
   * Wire the plate: hover lights a region, the wheel zooms about the cursor,
   * and a drag pans.
   *
   * A DRAG IS NOT A CLICK. Panning with the same button that selects would
   * otherwise change the selection every time the map is moved, so the
   * pointer's travel is measured and a click is only a click if it stayed
   * within a few pixels of where it went down.
   */
  #bindPlate() {
    const viewport = this.element.querySelector(".azeroth-map-viewport");
    const surface = this.element.querySelector(".azeroth-map-base");
    if (!viewport || !surface) return;

    viewport.addEventListener("wheel", event => {
      event.preventDefault();
      this.#zoomBy(event.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step, { x: event.clientX, y: event.clientY });
    }, { passive: false });

    let drag = null;
    viewport.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      // A PIN HANDLES ITS OWN CLICK. The pins sit inside the viewport, so
      // without this a click on one would start a drag, end as a click, and
      // select the region underneath as well as opening what the pin points at.
      if (event.target.closest(".azeroth-map-pin")) return;
      drag = { x: event.clientX, y: event.clientY, ox: this.#v.x, oy: this.#v.y, moved: 0 };
      // Capture is an optimisation — it keeps a drag alive when the pointer
      // leaves the frame — and it THROWS for a pointer the browser has no
      // record of, which a synthesised event is. The release below was already
      // guarded; this one was not, so a test that drove the plate the way a
      // hand does took the handler down with a NotFoundError.
      try { viewport.setPointerCapture(event.pointerId); } catch { /* not a live pointer */ }
    });

    viewport.addEventListener("pointermove", event => {
      if (!drag) {
        this.#hoverAt(event);
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      this.#v.x = drag.ox + dx;
      this.#v.y = drag.oy + dy;
      this.#clampView();
      this.#applyView();
    });

    viewport.addEventListener("pointerup", event => {
      if (!drag) return;
      const wasClick = drag.moved < 4;
      drag = null;
      try { viewport.releasePointerCapture(event.pointerId); } catch { /* already released */ }
      if (wasClick) this.#selectAt(event);
    });
    viewport.addEventListener("pointercancel", () => { drag = null; });

    viewport.addEventListener("pointerleave", () => {
      this.#local.hovered = null;
      this.#showHoverLabel(null);
      this.#painting = this.#paint();
    });

    surface.addEventListener("dblclick", () => this.#resetView());
  }

  /** A plate event, shaped the way `regionAtPoint` wants it. */
  #plateEvent(event) {
    return {
      clientX: event.clientX,
      clientY: event.clientY,
      currentTarget: this.element.querySelector(".azeroth-map-base")
    };
  }

  /** Light the region under the cursor and name it. */
  async #hoverAt(event) {
    const key = await this.regionAtPoint(this.#plateEvent(event));
    if (key === this.#local.hovered) return;
    this.#local.hovered = key;
    this.#showHoverLabel(key);
    const plate = await this.#plate(this.#local.continent);
    if (plate && !plate.missing) this.#light(".azeroth-map-hot", plate, key, HOVER_ALPHA);
  }

  #showHoverLabel(key) {
    const label = this.element?.querySelector(".azeroth-map-hover");
    if (!label) return;
    const region = regionOf(key);
    label.textContent = region ? region.name : "";
    label.hidden = !region;
  }

  async #selectAt(event) {
    // MARKING A SETTLEMENT TAKES THE CLICK. While a settlement is waiting for
    // a place, the next click on the plate is where it goes — anywhere at all,
    // including outside its own region, because a harbour or a watchpost is
    // not always inside the province that claims it.
    if (this.#local.placing) {
      await this.#placePin(event);
      return;
    }
    const key = await this.regionAtPoint(this.#plateEvent(event));
    if (!key) return;
    this.#local.selected = key;
    await this.render();
  }

  /** Drop the waiting settlement where the plate was clicked. */
  async #placePin(event) {
    const surface = this.element.querySelector(".azeroth-map-base");
    const box = surface?.getBoundingClientRect();
    if (!box?.width || !box?.height) return;
    const x = Number(((event.clientX - box.left) / box.width).toFixed(4));
    const y = Number(((event.clientY - box.top) / box.height).toFixed(4));
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    const { key, name } = this.#local.placing;
    this.#local.placing = null;
    await setMapState(setSettlementLink(this.world, key, name, { pin: [x, y] }));
    await this.render();
  }

  /**
   * Every `data-map` control, on `change`.
   *
   * NOT `data-action`: the actions map fires on click alone, so a select or a
   * textarea wired that way looks connected and saves nothing.
   */
  async #readForm(el) {
    if (!game.user?.isGM) return;
    const kind = el.dataset.map;
    const key = el.dataset.region;
    const name = el.dataset.settlement;

    if (kind === "note" && key) {
      await setMapState(setNote(this.world, key, el.value));
      return;
    }
    if (kind === "hideByDefault") {
      await setMapState(setHideByDefault(this.world, el.checked));
      await this.render();
      return;
    }
    if ((kind === "scene" || kind === "journal") && key) {
      const value = el.value || null;
      const world = name
        ? setSettlementLink(this.world, key, name, { [kind]: value })
        : setLink(this.world, key, { [kind]: value });
      await setMapState(world);
      await this.render();
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static async #onContinent(event, target) {
    this.#local.continent = target.dataset.continent;
    this.#local.selected = null;
    await this.render();
  }

  static async #onSelect(event, target) {
    this.#local.selected = target.dataset.region;
    await this.render();
  }

  static async #onSetControl(event, target) {
    if (!game.user?.isGM) return;
    const { region, control } = target.dataset;
    await setMapState(setControl(this.world, region, control, { by: game.user.id }));
  }

  static async #onMoveParty(event, target) {
    if (!game.user?.isGM) return;
    await setMapState(setParty(this.world, target.dataset.region));
  }

  static async #onClearParty() {
    if (!game.user?.isGM) return;
    await setMapState(setParty(this.world, null));
  }

  /**
   * Open the region's own page in the rules journal. Resolved by NAME rather
   * than by a stored id, so the two parsers stay independent — `rules-journal`
   * owns those ids and this window has no business knowing them.
   */
  static async #onReadEntry(event, target) {
    const region = regionOf(target.dataset.region);
    if (!region) return;

    // THE WORLD'S COPY FIRST. Once the book has been imported into the
    // Journals tab, opening the compendium copy instead would hand the reader
    // a second, read-only document that none of their notes are on.
    let journal = worldChapterNamed(region.chapter);
    if (!journal) {
      const pack = game.packs.get("azeroth-rpg.rules");
      const entry = pack?.index.find(e => e.name?.toUpperCase().includes(region.chapter));
      if (entry) journal = await pack.getDocument(entry._id);
    }
    if (!journal) return;

    const page = journal.pages?.find(p => p.name?.replace(/^\d+\.\s*/, "") === region.name);
    journal.sheet.render({ force: true, ...(page ? { pageId: page.id } : {}) });
  }

  static async #onToggleWide() {
    this.#local.wide = !this.#local.wide;
    await this.render();
    await new Promise(resolve => requestAnimationFrame(resolve));
    this.#refit();
  }

  static async #onToggleEdit() {
    if (!game.user?.isGM) return;
    this.#local.editing = !this.#local.editing;
    if (!this.#local.editing) this.#local.placing = null;
    await this.render();
  }

  /** Look at the map the way a player does, without changing anything. */
  static async #onTogglePreview() {
    if (!game.user?.isGM) return;
    this.#local.preview = !this.#local.preview;
    await this.render();
  }

  static async #onShowRegion(event, target) {
    if (!game.user?.isGM) return;
    const { region, shown } = target.dataset;
    await setMapState(setRegionVisible(this.world, region, shown === "true"));
    await this.render();
  }

  static async #onShowField(event, target) {
    if (!game.user?.isGM) return;
    const { region, field, shown } = target.dataset;
    await setMapState(setFieldVisible(this.world, region, field, shown === "true"));
    await this.render();
  }

  static async #onShowSettlement(event, target) {
    if (!game.user?.isGM) return;
    const { region, settlement, shown } = target.dataset;
    await setMapState(setSettlementVisible(this.world, region, settlement, shown === "true"));
    await this.render();
  }

  static async #onShowAllSettlements(event, target) {
    if (!game.user?.isGM) return;
    const { region, shown } = target.dataset;
    await setMapState(setAllSettlementsVisible(this.world, region, shown === "true"));
    await this.render();
  }

  /** Arm the next click on the plate to place this settlement. */
  static async #onMarkSettlement(event, target) {
    if (!game.user?.isGM) return;
    const { region, settlement } = target.dataset;
    const armed = this.#local.placing;
    this.#local.placing = (armed?.key === region && armed?.name === settlement)
      ? null
      : { key: region, name: settlement };
    await this.render();
  }

  static async #onClearPin(event, target) {
    if (!game.user?.isGM) return;
    const { region, settlement } = target.dataset;
    await setMapState(setSettlementLink(this.world, region, settlement, { pin: null }));
    await this.render();
  }

  /** Open whatever a region or a settlement is linked to. */
  static async #onOpenLink(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    if (!doc) return ui.notifications?.warn(game.i18n.localize("AZEROTH.Map.LinkGone"));
    // A Scene is VIEWED, not activated: activating pulls the whole table onto
    // it, which is the GM's call to make deliberately and never a side effect
    // of reading the map.
    if (doc instanceof Scene) await doc.view();
    else doc.sheet?.render({ force: true });
  }

  /** A pin on the plate opens its Scene, else its Journal, else its region. */
  static async #onOpenPin(event, target) {
    const { region, settlement } = target.dataset;
    const mark = settlementLink(this.world, region, settlement);
    const uuid = mark.scene ?? mark.journal ?? null;
    if (uuid) {
      const doc = await fromUuid(uuid);
      if (doc instanceof Scene) return doc.view();
      if (doc) return doc.sheet?.render({ force: true });
    }
    this.#local.selected = region;
    await this.render();
  }

  static #onZoomIn() { this.#zoomBy(ZOOM.step); }

  static #onZoomOut() { this.#zoomBy(1 / ZOOM.step); }

  static #onZoomFit() { this.#resetView(); }

  static async #onReset() {
    if (!game.user?.isGM) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AZEROTH.Map.Reset") },
      content: `<p>${game.i18n.localize("AZEROTH.Map.ResetConfirm")}</p>`
    });
    if (!ok) return;
    const world = this.world;
    await setMapState({ ...world, control: {} });
  }

}
