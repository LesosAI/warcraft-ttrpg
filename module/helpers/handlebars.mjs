/**
 * Handlebars helpers and template preloading.
 *
 * Helpers are namespaced `azeroth*` so nothing collides with core's or another
 * package's. Every one of them is presentation only — no helper computes a game
 * number, because that belongs in `rules/` where it can be tested (CLAUDE.md §3).
 */

const { loadTemplates } = foundry.applications.handlebars;

/** Partials and card templates loaded once at init. */
const TEMPLATES = [
  "systems/azeroth-rpg/templates/chat/partials/provenance.hbs",
  "systems/azeroth-rpg/templates/chat/partials/verdict.hbs",
  "systems/azeroth-rpg/templates/chat/partials/heal.hbs",
  "systems/azeroth-rpg/templates/chat/partials/card-header.hbs",
  "systems/azeroth-rpg/templates/chat/roll-card.hbs",
  "systems/azeroth-rpg/templates/chat/spell-card.hbs",
  "systems/azeroth-rpg/templates/chat/corruption-card.hbs",
  "systems/azeroth-rpg/templates/chat/critical-card.hbs",
  // The offer of loot, offered and settled (D-721).
  "systems/azeroth-rpg/templates/chat/loot-card.hbs",
  "systems/azeroth-rpg/templates/actor/npc-banner.hbs",
  "systems/azeroth-rpg/templates/actor/npc-statistics.hbs",
  "systems/azeroth-rpg/templates/actor/npc-traits.hbs",
  "systems/azeroth-rpg/templates/actor/npc-notes.hbs",
  "systems/azeroth-rpg/templates/dialog/roll-test.hbs",
  // What a Short Rest eats and drinks (05 §16, 08 §12; D-733).
  "systems/azeroth-rpg/templates/dialog/rest.hbs",
  "systems/azeroth-rpg/templates/actor/partials/effects.hbs",
  "systems/azeroth-rpg/templates/actor/partials/effect-list.hbs",
  "systems/azeroth-rpg/templates/dialog/affix.hbs",
  "systems/azeroth-rpg/templates/dialog/partials/ability-automation.hbs",
  "systems/azeroth-rpg/templates/actor/partials/item-detail.hbs",
  "systems/azeroth-rpg/templates/actor/partials/carried-row.hbs",
  "systems/azeroth-rpg/templates/actor/partials/star.hbs",
  "systems/azeroth-rpg/templates/actor/partials/item-icon.hbs",
  // One tile of the Overview figure (D-687).
  "systems/azeroth-rpg/templates/actor/partials/slot-tile.hbs",
  // What is acting on the character right now, under the hands row (the lead,
  // 2026-09-20). A reading of `effectsContext` - the object the two partials
  // above it are drawn from - and never a second walk of `actor.effects`.
  "systems/azeroth-rpg/templates/actor/partials/in-play.hbs",
  // The Gear tab as bag slots (D-738). FIVE partials, every one of them named
  // by `gear.hbs` or by another of the five - and a partial a template names
  // and this list does not hold is not a missing style, it THROWS at render
  // and takes the whole part down with it (D-705).
  "systems/azeroth-rpg/templates/actor/partials/bag-bar.hbs",
  "systems/azeroth-rpg/templates/actor/partials/bag-panel.hbs",
  "systems/azeroth-rpg/templates/actor/partials/bag-tile.hbs",
  "systems/azeroth-rpg/templates/actor/partials/bag-inspector.hbs",
  // Rendered per tile into `tile.tipHtml` rather than included: core takes the
  // card as an HTML STRING through `data-tooltip-html`.
  "systems/azeroth-rpg/templates/actor/partials/item-tooltip.hbs",
  "systems/azeroth-rpg/templates/actor/partials/pool.hbs",
  // One pool row on a creature's sheet, drawn by Statistics and by the Spells
  // tab's header (D-705). A partial a template names and this list does not
  // hold is not a missing style - it THROWS at render, and takes the whole
  // part down with it.
  "systems/azeroth-rpg/templates/actor/partials/npc-pool.hbs",
  "systems/azeroth-rpg/templates/actor/partials/uses.hbs",
  // One talent tile, drawn by the tree and by the racial row (D-758). A
  // partial `progress.hbs` names and this list does not hold THROWS at
  // render and takes the whole Progress part down with it (D-705).
  "systems/azeroth-rpg/templates/actor/partials/talent-tile.hbs",
  "systems/azeroth-rpg/templates/chat/rest-card.hbs",
  "systems/azeroth-rpg/templates/chat/maneuver-card.hbs",
  "systems/azeroth-rpg/templates/chat/prompt-card.hbs",
  // The character creator's ten panes (D-636), one partial a step.
  "systems/azeroth-rpg/templates/creator/race.hbs",
  "systems/azeroth-rpg/templates/creator/class.hbs",
  "systems/azeroth-rpg/templates/creator/abilities.hbs",
  "systems/azeroth-rpg/templates/creator/career.hbs",
  "systems/azeroth-rpg/templates/creator/skills.hbs",
  "systems/azeroth-rpg/templates/creator/talents.hbs",
  "systems/azeroth-rpg/templates/creator/spells.hbs",
  "systems/azeroth-rpg/templates/creator/languages.hbs",
  "systems/azeroth-rpg/templates/creator/equipment.hbs",
  "systems/azeroth-rpg/templates/creator/numbers.hbs",
  "systems/azeroth-rpg/templates/creator/name.hbs",
  // The world map (D-680).
  "systems/azeroth-rpg/templates/map/world-map.hbs"
];

export async function preloadTemplates() {
  return loadTemplates(TEMPLATES);
}

export function registerHelpers() {
  Handlebars.registerHelper({
    /** `+3` / `−2` / `+0`, with a true minus sign rather than a hyphen. */
    azerothSigned(value) {
      const n = Number(value) || 0;
      return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
    },

    /**
     * A Success Level as the book writes it. SL 0 is a bare success, not a
     * failure, so it reads as `SL 0` rather than as nothing.
     */
    azerothSL(value) {
      if (value === null || value === undefined) return "";
      const n = Number(value);
      return n < 0 ? `SL −${Math.abs(n)}` : `SL ${n}`;
    },

    /**
     * An em-dash where a value is absent. A pool nobody has draws one rather
     * than an empty bar (D-509), and so does an absent Ward (D-490) — the
     * absence is load-bearing, so it is drawn rather than omitted.
     */
    azerothDash(value) {
      return value === null || value === undefined || value === "" ? "—" : value;
    },

    /** Title-case a config key for display when no localization applies. */
    azerothLabel(key) {
      if (!key) return "";
      const s = String(key).replace(/([A-Z])/g, " $1");
      return s.charAt(0).toUpperCase() + s.slice(1);
    },

    /** Whether an array holds a value — for `{{#if (azerothHas list "x")}}`. */
    azerothHas(list, value) {
      return Array.isArray(list) && list.includes(value);
    }
  });
}
