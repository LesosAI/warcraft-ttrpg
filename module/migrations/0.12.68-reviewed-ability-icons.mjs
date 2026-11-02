import reviewed from "../rules/spell-talent-icons.json" with { type: "json" };
import { ICON_DIR } from "../rules/icons.mjs";
import { rawSystem, walkWorld } from "./walk.mjs";

/** Preserve custom artwork and renamed/homebrew items; repair exact old assignments only. */
export function reviewedAbilityIconUpdate(type, raw, name, img, decisions = reviewed) {
  if (type !== "spell" && type !== "talent") return null;
  const row = decisions[`${type}:${raw?.identifier}`];
  if (!row || row.name !== name || row.source !== raw?.source?.document) return null;
  if ((row.race ?? null) !== (raw?.race || null)) return null;
  const target = `${ICON_DIR}/${row.icon}.png`;
  if (img === target || !row.previousIcons.some(icon => img === `${ICON_DIR}/${icon}.png`)) return null;
  return { img: target };
}

export async function migrate(log = console.log) {
  return walkWorld({ item: doc => reviewedAbilityIconUpdate(
    doc.type, rawSystem(doc), doc.name, doc._source?.img ?? doc.img
  ) }, log);
}
