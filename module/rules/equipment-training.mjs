/** Equipment training, shared by the creator, owned-item UI and roll defaults.
 * Armor access includes every lighter category (lead ruling, 2026-10-29).
 * Class tracks combine; only taken talents grant additional training.
 */
import { armorAccessFor } from "./class-talents.mjs";
import { strikeFor, weaponFacts } from "./strikes.mjs";
import { gripOf } from "./worn.mjs";
import { meldsGear } from "./shapes.mjs";
import { AZEROTH } from "../config.mjs";

const ARMOR_ORDER = Object.keys(AZEROTH.armorCategories);
const sysOf = item => item?.system ?? item ?? {};

export function trainingProfile({ classes = [], talents = [], extraArmor = [], extraShields = false, rowOf = undefined } = {}) {
  const rows = classes.map(sysOf);
  const talentRows = talents.map(t => ({ name: t.name, ...sysOf(t) }));
  // `rowOf` is `armorAccessFor`'s own seam (its default is the talent table).
  const byTalent = armorAccessFor(talentRows, rowOf);
  const access = [...rows.flatMap(c => c.armor ?? []), ...extraArmor, ...byTalent.categories];
  const ceiling = Math.max(0, ...access.map(c => ARMOR_ORDER.indexOf(c)));
  return {
    known: rows.length > 0,
    armor: ARMOR_ORDER.slice(0, ceiling + 1),
    // A shield by class, or by a talent taken (D-855: Bronzed Steel's *carry a
    // shield*), or by the creator's talent pick (`extraShields`).
    shields: rows.some(c => c.shields === true) || extraShields === true || byTalent.shields,
    weapons: [...new Set(rows.flatMap(c => String(c.weapons ?? "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean)))]
  };
}

/** Read active class tracks rather than treating every embedded class as active. */
export function actorTraining(actor) {
  const items = Array.from(actor?.items ?? []);
  const classes = actor?.classItems ?? (Array.isArray(actor?.system?.classes)
    ? actor.system.classes.map(c => items.find(i => (i.id ?? i._id) === c.itemId && i.type === "class")).filter(Boolean)
    : items.filter(i => i.type === "class"));
  const profile = trainingProfile({ classes, talents: items.filter(i => i.type === "talent") });
  return { ...profile, known: actor?.type === "character" && profile.known };
}

function launcherAccess(launcher, access) {
  return access.includes("any") || (launcher === "bow" && access.includes("bows"))
    || (["crossbow", "heavyCrossbow", "handCrossbow"].includes(launcher) && access.includes("crossbows"))
    || (launcher === "firearm" && access.includes("firearms"));
}

/** Use the existing base/Classic classifier so a named dagger stays a dagger. */
export function weaponTraining(item, access = []) {
  if (access.includes("any") || item?.natural) return true;
  const sys = sysOf(item);
  const doc = item?.system ? item : { ...item, system: sys };
  if (sys.identifier === "unarmed" || /^unarmed$/i.test(item?.name ?? "")) return true;
  if (sys.launcher) return launcherAccess(sys.launcher, access);
  if (sys.fits?.length) return sys.fits.some(k => launcherAccess(k, access));
  const facts = weaponFacts(doc);
  const form = strikeFor(facts, { mode: "melee" }).form;
  const classic = String(facts.subclass ?? "").toLowerCase();
  // Classic's real subclass takes precedence over its conversion base/type.
  const type = classic === "dagger" ? "dagger" : (sys.weaponType ?? "");
  const words = [sys.identifier, item?.name, facts.base].filter(Boolean).join(" ").toLowerCase();
  const dagger = classic === "dagger" || type === "dagger" || form === "dagger";
  const sword = !dagger && (type === "sword" || ["sword", "shortsword", "greatsword", "rapier", "scimitar"].includes(form));
  const staff = type === "staff" || form === "quarterstaff" || classic === "staff";
  const mace = classic === "mace" || type === "mace" || form === "mace" || form === "wrench";
  const hammer = type === "hammer" || ["hammer", "warhammer", "maul"].includes(form);
  const axe = type === "axe" || ["axe", "greataxe", "thrown-axe"].includes(form);
  const polearm = type === "polearm" || classic === "polearm" || ["halberd", "scythe"].includes(form);
  const wand = classic === "wand" || /\bwand\b/.test(words);
  const claw = type === "fist" || classic === "fist weapon" || /\bclaws?\b/.test(words);
  const thrown = classic === "thrown" || (sys.traits ?? []).some(t => /^Thrown\b/i.test(t));
  const grip = gripOf(doc);
  const shortBlade = dagger || (sword && (form === "shortsword" || /\bLight\b/i.test((sys.traits ?? []).join(" "))));
  const oneHanded = ["light", "one-handed", "hand-and-a-half"].includes(grip);
  // **"swords"** is 02's Chronomancer row (*Daggers, swords, staves, wands*): every sword, short
  // or long, and no dagger, which is its own word on the same row (the live fix: the word was in
  // no branch, so every sword a Chronomancer drew carried the untrained Bane).
  return access.some(a => (a === "daggers" && dagger) || (a === "swords" && sword) || (a === "blades" && (dagger || sword || type === "glaive"))
    || (a === "short blades" && shortBlade) || (a === "staves" && staff) || (a === "maces" && mace)
    || (a === "hammers" && hammer) || (a === "axes" && axe) || (a === "polearms" && polearm)
    || (a === "wands" && wand) || (a === "claws" && claw) || (a === "thrown" && thrown)
    || (a === "one-handed melee" && oneHanded));
}

/** Null means no training warning. Gear and NPCs have no class-training penalty. */
export function trainingWarning(item, profile) {
  if (!item || !profile?.known) return null;
  const sys = sysOf(item);
  if (item.type === "armor") {
    if (sys.shield) return profile.shields ? null : "shield";
    return profile.armor.includes(sys.category ?? "none") ? null : "armor";
  }
  return item.type === "weapon" && !weaponTraining(item, profile.weapons) ? "weapon" : null;
}

/** One untrained Bane, naming every contributing item, not one Bane per item. */
export function untrainedForRoll(actor, { kind, weaponId = null } = {}) {
  const profile = actorTraining(actor);
  if (!profile.known) return [];
  const items = Array.from(actor?.items ?? []);
  const melded = meldsGear(actor?.shape?.kind);
  const using = items.filter(i => (kind === "attack" && weaponId && (i.id ?? i._id) === weaponId)
    || (!melded && i.type === "armor" && sysOf(i).equipped === true));
  return [...new Set(using.filter(i => trainingWarning(i, profile)).map(i => i.name))];
}
