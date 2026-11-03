/**
 * Migration chain. One file per target version, each exporting an idempotent
 * async `migrate()`. See CLAUDE.md §10.
 *
 * The world's last-migrated version lives in the `migrationVersion` setting.
 * On ready, a GM runs every migration newer than it, in order.
 */

import * as v020 from "./0.2.0-corruption-tracks.mjs";
import * as v030 from "./0.3.0-momentum-power.mjs";
import * as v040 from "./0.4.0-power-per-class.mjs";
import * as v050 from "./0.5.0-momentum-per-class.mjs";
import * as v060 from "./0.6.0-class-branches.mjs";
import * as v070 from "./0.7.0-class-tables.mjs";
import * as v080 from "./0.8.0-uses-heal-dying.mjs";
import * as v090 from "./0.9.0-forge.mjs";
import * as v0100 from "./0.10.0-creators.mjs";
import * as v0110 from "./0.11.0-play.mjs";
import * as v0111 from "./0.11.1-spell-descriptors.mjs";
import * as v0112 from "./0.11.2-consumable-use.mjs";
import * as v0113 from "./0.11.3-containers.mjs";
import * as v0114 from "./0.11.4-casting-corruption.mjs";
import * as v0115 from "./0.11.5-worn-slots.mjs";
import * as v0116 from "./0.11.6-bestiary-art.mjs";
import * as v0117 from "./0.11.7-slot-merge.mjs";
import * as v0118 from "./0.11.8-found-items.mjs";
import * as v0119 from "./0.11.9-bestiary-automation.mjs";
import * as v01110 from "./0.11.10-reactions.mjs";
import * as v0120 from "./0.12.0-signature-effects.mjs";
import * as v0121 from "./0.12.1-signature-rewrites.mjs";
import * as v0122 from "./0.12.2-classic-ratings.mjs";
import * as v0123 from "./0.12.3-classic-lines.mjs";
import * as v0124 from "./0.12.4-creature-gear.mjs";
import * as v0125 from "./0.12.5-attribute-bands.mjs";
import * as v0126 from "./0.12.6-character-tokens.mjs";
import * as v0128 from "./0.12.8-signature-branches.mjs";
import * as v0129 from "./0.12.9-provisions.mjs";
import * as v01210 from "./0.12.10-bag-slots.mjs";
import * as v01211 from "./0.12.11-bag-wells.mjs";
import * as v01212 from "./0.12.12-paladin-areas.mjs";
import * as v01213 from "./0.12.13-talent-row-order.mjs";
import * as v01214 from "./0.12.14-area-movement.mjs";
import * as v01215 from "./0.12.15-character-sight.mjs";
import * as v01220 from "./0.12.20-shapes.mjs";
import * as v01221 from "./0.12.21-spell-ticks.mjs";
import * as v01222 from "./0.12.22-spell-reductions.mjs";
import * as v01223 from "./0.12.23-temporary-health.mjs";
import * as v01224 from "./0.12.24-cross-class.mjs";
import * as v01225 from "./0.12.25-legacy-branches.mjs";
import * as v01226 from "./0.12.26-resist-halves.mjs";
import * as v01227 from "./0.12.27-fail-damage.mjs";
import * as v01228 from "./0.12.28-marks.mjs";
import * as v01229 from "./0.12.29-later-tests.mjs";
import * as v01230 from "./0.12.30-gadget-links.mjs";
import * as v01231 from "./0.12.31-gadgeteer-tier.mjs";
import * as v01232 from "./0.12.32-sacrifice-text.mjs";
import * as v01233 from "./0.12.33-blood-pact-cost.mjs";
import * as v01234 from "./0.12.34-miracle-text.mjs";
import * as v01235 from "./0.12.35-searing-fire.mjs";
import * as v01236 from "./0.12.36-restorative-potion.mjs";
import * as v01259 from "./0.12.59-consumable-rulings.mjs";
import * as v01237 from "./0.12.37-chromatic-flask.mjs";
import * as v01238 from "./0.12.38-signature-skill.mjs";
import * as v01239 from "./0.12.39-signature-casting.mjs";
import * as v01240 from "./0.12.40-approved-spell-signatures.mjs";
import * as v01241 from "./0.12.41-approved-charms.mjs";
import * as v01242 from "./0.12.42-signature-healing.mjs";
import * as v01243 from "./0.12.43-approved-healing-signatures.mjs";
import * as v01244 from "./0.12.44-signature-parry.mjs";
import * as v01245 from "./0.12.45-approved-conqueror.mjs";
import * as v01246 from "./0.12.46-approved-cannonball.mjs";
import * as v01247 from "./0.12.47-signature-kill-reward.mjs";
import * as v01248 from "./0.12.48-approved-kill-signatures.mjs";
import * as v01249 from "./0.12.49-signature-hit-damage.mjs";
import * as v01250 from "./0.12.50-approved-horseman.mjs";
import * as v01251 from "./0.12.51-approved-piccolo.mjs";
import * as v01252 from "./0.12.52-approved-jangthraze.mjs";
import * as v01253 from "./0.12.53-approved-helmet.mjs";
import * as v01254 from "./0.12.54-approved-idols.mjs";
import * as v01255 from "./0.12.55-racial-arc-uses.mjs";
import * as v01256 from "./0.12.56-approved-racial-text.mjs";
import * as v01257 from "./0.12.57-militia-groups.mjs";
import * as v01258 from "./0.12.58-racial-clarifications.mjs";
import * as v01260 from './0.12.60-shaman-rulings.mjs';
import * as v01261 from './0.12.61-approved-band.mjs';
import * as v01262 from './0.12.62-parry-demon-rulings.mjs';
import * as v01263 from './0.12.63-mind-control-sustain.mjs';
import * as v01264 from './0.12.64-racial-arc-followup.mjs';
import * as v01265 from './0.12.65-pimgib-fallback-text.mjs';
import * as v01266 from './0.12.66-blueprint-expiry-text.mjs';
import * as v01267 from './0.12.67-mountain-lion-text.mjs';
import * as v01268 from './0.12.68-reviewed-ability-icons.mjs';
import * as v01269 from "./0.12.69-token-portraits.mjs";
import * as v01270 from "./0.12.70-blood-fury-text.mjs";
import { forgetPacks } from "./walk.mjs";

// Ordered oldest to newest. Add new entries at the end.
const CHAIN = [
  { version: "0.2.0", module: v020 },
  { version: "0.3.0", module: v030 },
  { version: "0.4.0", module: v040 },
  { version: "0.5.0", module: v050 },
  { version: "0.6.0", module: v060 },
  { version: "0.7.0", module: v070 },
  { version: "0.8.0", module: v080 },
  { version: "0.9.0", module: v090 },
  { version: "0.10.0", module: v0100 },
  { version: "0.11.0", module: v0110 },
  { version: "0.11.1", module: v0111 },
  { version: "0.11.2", module: v0112 },
  { version: "0.11.3", module: v0113 },
  { version: "0.11.4", module: v0114 },
  { version: "0.11.5", module: v0115 },
  { version: "0.11.6", module: v0116 },
  { version: "0.11.7", module: v0117 },
  { version: "0.11.8", module: v0118 },
  { version: "0.11.9", module: v0119 },
  { version: "0.11.10", module: v01110 },
  { version: "0.12.0", module: v0120 },
  { version: "0.12.1", module: v0121 },
  { version: "0.12.2", module: v0122 },
  { version: "0.12.3", module: v0123 },
  { version: "0.12.4", module: v0124 },
  { version: "0.12.5", module: v0125 },
  { version: "0.12.6", module: v0126 },
  // 0.12.7 is the Mana discount the lead asked for on 2026-09-14, which needed
  // no migration: both halves of `spellCost` carry `initial: null`, so every
  // stored descriptor reads as *no discount* - which is what it was (D-665).
  { version: "0.12.8", module: v0128 },
  // 08 §12's food and drink, so a Short Rest can find something to eat in a
  // world made before D-733.
  { version: "0.12.9", module: v0129 },
  // Bag slots: worn or kept and never both, the containers that hold things
  // put on, and nesting unwound (D-735 to D-742).
  { version: "0.12.10", module: v01210 },
  // WHICH WELL each thing sits in, stamped from the order it is already drawn
  // in so nothing reshuffles on load (the lead, 2026-09-20).
  { version: "0.12.11", module: v01211 },
  // Lay on Hands once per Long Rest and Open Hand its second use, Consecrated
  // Ground teaching Consecration, 07's Difficult ground, and every spell's
  // start-of-turn tick (D-752 to D-754, D-756).
  { version: "0.12.12", module: v01212 },
  // 04's row order on the talents an actor holds, so the tree draws the book's
  // columns rather than the alphabet's (D-218, D-758).
  { version: "0.12.13", module: v01213 },
  // What an area does to a creature entering it or standing in it, and where
  // it is Difficult ground: every spell's tick and ground off its pack copy
  // (D-757).
  { version: "0.12.14", module: v01214 },
  // A player character's token sees: sight switched on for every character's
  // prototype and every one already placed, and nothing else touched (D-759).
  { version: "0.12.15", module: v01215 },
  // 0.12.16 to 0.12.19 changed no stored shape. A shape is one Active Effect:
  // the retired `form` flag becomes the Shapeshift effect, or is dropped where
  // it names no block (D-769).
  { version: "0.12.20", module: v01220 },
  // A spell's tick on the creature it is laid on (D-770): every spell's `tick`
  // off its pack copy, and the lay door's `applies` where a *cannot be* clause
  // was laid as the condition it refuses, or a Ward named two schools.
  { version: "0.12.21", module: v01221 },
  // Two spells' laid effects read off 07 again (D-774): Pain Suppression and
  // Barkskin lay *Damage the target takes is reduced by 3*, and Pain
  // Suppression no longer lays the Bleeding its target may ignore.
  { version: "0.12.22", module: v01222 },
  // 05's temporary Health on both actors (D-777): `health.temp` from 0, its
  // stored value guarded where present, and a spent grant's record cleared.
  { version: "0.12.23", module: v01223 },
  // The cross-class rulings (D-778): a failure's conditions off the failure's own
  // clause (Absolute Zero, Stormwall), and the reasons the area and the tick no
  // longer carry (Tempest, Void Rift, Rimebind, Thornguard; Felfire Aura, Felstep),
  // every spell's three descriptors off its pack copy.
  { version: "0.12.24", module: v01224 },
  // The Legacies become talent branches (D-781): a character of a Legacy's people
  // given the branch on the class it holds, a Legacy item rewritten whole as lore,
  // 08 §7's Type on every weapon off its pack copy, and five undead made Mindless.
  { version: "0.12.25", module: v01225 },
  // Half the damage on a passed Test (the lead: *"Build it everywhere"*): every
  // book-worded spell's `damage.half` off its pack copy, and nothing else.
  { version: "0.12.26", module: v01226 },
  // None of it on a passed Test where the failure deals it (Rimebind), and the splash
  // around a spell's target (Stormfury): every book-worded spell's `damage.onFail` and
  // `splash` off its pack copy, and nothing else.
  { version: "0.12.27", module: v01227 },
  // The damage that bypasses armor and Ward (Stormfury and eight more), and what a creature
  // ability's Test governs (14's half on a pass, its spare, its condition): every book-worded
  // spell's `damage.bypass` and every book-worded ability's three marks off their pack copies.
  { version: "0.12.28", module: v01228 },
  // The later Tests' doors (the lead: *"Build the triggers"*): Ring of Fire's and
  // Stormwall's crossing, Frozen Rune's first entry, Nether Rift's Bane inside it, the
  // creatures Blackout and The Deep name at the cast, and Holy Wrath's and Earth Shock's
  // Test field: every book-worded spell's descriptor and Test off its pack copy.
  { version: "0.12.29", module: v01229 },
  // Gadgeteer links the gadgets it names (the lead, 2026-10-24): every held copy of a
  // talent whose pack copy links the Gadgets compendium takes the pack's text, while its
  // words are still the book's.
  { version: "0.12.30", module: v01230 },
  { version: "0.12.31", module: v01231 },
  { version: "0.12.32", module: v01232 },
  { version: "0.12.33", module: v01233 },
  { version: "0.12.34", module: v01234 },
  { version: "0.12.35", module: v01235 },
  { version: "0.12.36", module: v01236 },
  { version: "0.12.37", module: v01237 },
  { version: "0.12.38", module: v01238 },
  { version: "0.12.39", module: v01239 },
  { version: "0.12.40", module: v01240 },
  { version: "0.12.41", module: v01241 },
  { version: "0.12.42", module: v01242 },
  { version: "0.12.43", module: v01243 },
  { version: "0.12.44", module: v01244 },
  { version: "0.12.45", module: v01245 },
  { version: "0.12.46", module: v01246 },
  { version: "0.12.47", module: v01247 },
  { version: "0.12.48", module: v01248 },
  { version: "0.12.49", module: v01249 },
  { version: "0.12.50", module: v01250 },
  { version: "0.12.51", module: v01251 },
  { version: "0.12.52", module: v01252 },
  { version: "0.12.53", module: v01253 },
  { version: "0.12.54", module: v01254 },
  { version: "0.12.55", module: v01255 },
  { version: "0.12.56", module: v01256 },
  { version: "0.12.57", module: v01257 },
  { version: "0.12.58", module: v01258 },
  { version: "0.12.59", module: v01259 },
  { version: "0.12.60", module: v01260 },
  { version: "0.12.61", module: v01261 },
  { version: "0.12.62", module: v01262 },
  { version: "0.12.63", module: v01263 },
  { version: "0.12.64", module: v01264 },
  { version: "0.12.65", module: v01265 },
  { version: "0.12.66", module: v01266 },
  { version: "0.12.67", module: v01267 },
  { version: "0.12.68", module: v01268 },
  // 0.12.69: a character's placeholder directory portrait takes its token art (D-797).
  { version: "0.12.69", module: v01269 },
  // 0.12.70: an owned Orc race item's Blood Fury reads the lead's ruling (D-798).
  { version: "0.12.70", module: v01270 }
];

/**
 * The source reshapes, oldest first, for `CharacterData.migrateData`.
 *
 * Derived from CHAIN rather than listed again, so a migration that adds a
 * `migrateSource` is picked up here without a second edit - and one that does
 * not need one is simply absent.
 */
export const SOURCE_MIGRATIONS = CHAIN
  .map(m => m.module.migrateSource)
  .filter(Boolean);

export const SETTING_KEY = "migrationVersion";

/** Compare two dotted version strings. Returns <0, 0 or >0. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Which migrations still need to run, given a starting version. */
export function pending(from, chain = CHAIN) {
  return chain.filter(m => compareVersions(m.version, from) > 0);
}

export async function runMigrations() {
  if (!game.user.isGM) return;

  const from = game.settings.get("azeroth-rpg", SETTING_KEY);
  const todo = pending(from);
  if (!todo.length) return;

  // CLAUDE.md §10: always tell the user to back up before a migration runs.
  ui.notifications?.warn(game.i18n.localize("AZEROTH.Migration.Backup"), { permanent: true });

  try {
    for (const { version, module } of todo) {
      console.log(game.i18n.format("AZEROTH.Migration.Begin", { version }));
      try {
        const count = await module.migrate(console.log);
        await game.settings.set("azeroth-rpg", SETTING_KEY, version);
        const done = game.i18n.format("AZEROTH.Migration.Done", { version, count });
        console.log(done);
        ui.notifications?.info(done);
      } catch (err) {
        console.error(game.i18n.format("AZEROTH.Migration.Failed", { version }), err);
        ui.notifications?.error(game.i18n.format("AZEROTH.Migration.Failed", { version }));
        // Stop the chain. The setting is not advanced, so a fixed build retries.
        return;
      }
    }
  } finally {
    // Three migrations now restore a field from the same three equipment packs
    // (D-697), and `walk.mjs` reads each of them once for the whole chain. The
    // cache is emptied HERE rather than left standing, so a world that
    // rebuilds a pack and migrates again reads what is on disk.
    forgetPacks();
  }
}
